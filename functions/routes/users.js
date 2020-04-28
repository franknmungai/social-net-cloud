/* eslint-disable consistent-return */
const express = require('express');
const firebase = require('firebase');
const Busboy = require('busboy'); //* library for parsing incoming html form-data
const path = require('path');
const os = require('os');
const fs = require('fs');
const config = require('../utils/config');
const { db, admin } = require('../utils/admin');
const {
	validateSignUpData,
	validateLoginData,
	reduceUserDetails
} = require('../utils/validators');
const FBAuth = require('../middleware/Auth');

const router = new express.Router();

router.post('/signup', async (req, res) => {
	try {
		// ? Due lower version of node used by firebase, we can't use spread
		const newUser = {
			email: req.body.email,
			password: req.body.password,
			confirmPassword: req.body.confirmPassword,
			handle: req.body.handle,
			createdAt: new Date().toISOString()
		};

		const { errors, valid } = validateSignUpData(newUser);

		//* validate
		if (!valid) return res.status(400).json({ errors });

		const noImage = 'no-image.png';
		newUser.imageUrl = `https://firebasestorage.googleapis.com/v0/b/socialnet-650b7.appspot.com/o/no-img.png?alt=media`;

		//* check if handle is taken, .doc() returns a document from the specified collection (our handle is our id), if none, from the all collections
		const doc = await db.doc(`/users/${newUser.handle}`).get();
		if (doc.exists) {
			return res.status(400).json({ handle: 'Handle already taken!' });
		}

		//* creates a new user account account with the specified email and password. data holds user credentials. Stored in Auth db
		const data = await firebase
			.auth()
			.createUserWithEmailAndPassword(newUser.email, newUser.password);

		const idToken = await data.user.getIdToken(); //* returns the id token if not expired

		newUser.userId = data.user.uid;
		//* store user in our users collection. using .set() writes data to the document. If document does not yet exist, it will be created.
		await db.doc(`/users/${newUser.handle}`).set(newUser);

		return res.status(201).json({
			message: `User ${newUser.handle} signed up successfully`,
			idToken
		});
	} catch (error) {
		if (error.code === 'auth/email-already-in-use')
			return res.status(400).json({ error: error.code });
		return res.status(500).json({ error: error.code });
	}
});

router.post('/login', async (req, res) => {
	const credentials = {
		email: req.body.email,
		password: req.body.password
	};

	const { errors, valid } = validateLoginData(credentials);
	if (!valid) return res.status(400).send(errors);

	try {
		//* synchronously signs in using an email and password.
		//Fails with an error if the email address and password do not match.
		const data = await firebase
			.auth()
			.signInWithEmailAndPassword(credentials.email, credentials.password);
		const token = await data.user.getIdToken();

		return res.json({ token });
	} catch (e) {
		if (e.code === 'auth/wrong-password')
			return res.status(403).send({ general: 'Wrong details' });
		res.status(500).send(e.code);
	}
});

//? Upload profile image

router.post('/user/image', FBAuth, async (req, res) => {
	const busboy = new Busboy({ headers: req.headers });

	let imageFileName;
	let imageToBeUploaded = {};
	busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
		if (
			mimetype !== 'image/jpeg' &&
			mimetype !== 'image/png' &&
			mimetype !== 'image/jpg'
		) {
			return res.status(400).send({ error: 'Upload an image' });
		}
		//* get file extention
		const imageExtention = filename.split('.')[filename.split('.').length - 1];

		//* generate a random filename
		imageFileName = `${Math.round(
			Math.random() * 1000000000
		).toString()}.${imageExtention}`;

		//* create filepath .tmpdir() temporary directory since we are not on a real server, but a cloud function
		const filepath = path.join(os.tmpdir(), imageFileName);

		imageToBeUploaded = { filepath, mimetype };
		//* create a stream object, it takes a filepath
		file.pipe(fs.createWriteStream(filepath));
	});

	busboy.on('finish', () => {
		//* upload file, takes in fileName and image
		admin
			.storage()
			.bucket()
			.upload(imageToBeUploaded.filepath, {
				resumable: false,
				metadata: {
					metadata: {
						contentType: imageToBeUploaded.mimetype
					}
				}
			})
			.then(() => {
				const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
				//* .update() to create a new field or update an existing field
				return db.doc(`/users/${req.user.handle}`).update({ imageUrl });
			})
			.then(() => {
				return res.send({ success: 'Image uploaded successfully' });
			})
			.catch(e => res.status(500).json({ error: e.code }));
	});

	busboy.end(req.rawBody);
});

// ? Add more details user account

router.post('/user', FBAuth, async (req, res) => {
	let profileDetails = reduceUserDetails(req.body);

	db.doc(`/users/${req.user.handle}`)
		.update(profileDetails)
		.then(() => {
			return res.send({ message: 'Profile updated successfully' });
		})
		.catch(error => {
			return res.status(500).send(error);
		});
});

//? get single user profile details
router.get('/user/profile', FBAuth, (req, res) => {
	let userData = {};
	db.doc(`/users/${req.user.handle}`) // get document
		.get()
		.then(doc => {
			if (doc.exists) {
				userData.credentials = doc.data(); // .data() returns all the fields in a document as an object
				return db
					.collection('likes')
					.where('userHandle', '==', doc.data().handle)
					.get();
			}
			return res.status(404).send({ message: 'Not Found' });
		})
		.then(data => {
			userData.likes = [];
			data.forEach(doc => {
				userData.likes.push(doc.data());
			});
			return db
				.collection('notifications')
				.where('recepient', '==', req.user.handle)
				.orderBy('createdAt', 'desc')
				.limit(10)
				.get();
			// return res.send(userData);
		})
		.then(data => {
			userData.notifications = [];
			data.forEach(doc => {
				userData.notifications.push(
					Object.assign({}, doc.data(), { notificationId: doc.id })
				);
			});
			return res.json(userData);
		})
		.catch(error => {
			res.status(500).send({ error });
		});
});

// ? Get/Search user by handle
router.get('/user/:handle', async (req, res) => {
	try {
		//get the requested user
		const user = await db.doc(`/users/${req.params.handle}`).get();
		if (!user.exists) {
			return res.status(404).send({ error: 'User Not found' });
		}

		const userData = user.data();
		//get their posts
		const posts = await db
			.collection('posts')
			.where('userHandle', '==', user.data().handle)
			.orderBy('createdAt', 'desc')
			.get();
		userData.posts = [];
		posts.forEach(post =>
			userData.posts.push(Object.assign({}, post.data(), { postId: post.id }))
		);
		return res.send(userData);
	} catch (error) {
		return res.status(500).json({ error });
	}
});

// ? Mark notifications as read.
//? WE use firebase batch to update multiple documents in the reference
router.post('/notifications', FBAuth, async (req, res) => {
	try {
		let batch = db.batch(); //batch performs multiple writes

		//*  The request receives a body with an array of notifications from the client
		const { notifications } = req.body;

		// confirm that all notifications are owned by the requestor
		const userNotifications = await db
			.collection('notifications')
			.where('recepient', '==', req.user.handle)
			.get();
		const notf = userNotifications.docs.map(_notf => _notf.id);
		const isOwn = notifications.every(notification =>
			notf.includes(notification)
		);
		if (!isOwn) return res.status(403).send({ error: 'Forbidden' });

		notifications.forEach(id => {
			const notification = db.doc(`/notifications/${id}`);

			//takes in a document reference and an object with the fields to update
			batch.update(notification, { read: true });
		});
		await batch.commit();
		res.send({ message: 'Notification marked as read' });
	} catch (error) {
		return res.status(500).send({ error });
	}
});

// ? send direct message > userId, body, FBAuth
router.post('/user/:userHandle/message', FBAuth, async (req, res) => {
	const { body } = req.body;
	const data = await db.collection('messages').add({
		body,
		sender: req.user.handle,
		recepient: req.params.userHandle,
		createdAt: new Date().toISOString()
	}); // add a new document to this collection and assign id automatically
	res.status(201).send({ message: 'Message sent successfully' });
});

// ? Get messages for a user
router.get('/messages/:senderHandle', FBAuth, async (req, res) => {
	//get messages for a user
	const data = await db
		.collection('messages')
		.where('recepient', '==', req.user.handle)
		.where('sender', '==', req.params.senderHandle)
		.get();
	if (data.empty) {
		return res.status(404).send({ error: 'No messages found' });
	}
	const messages = [];
	data.forEach(doc =>
		messages.push(Object.assign({}, doc.data(), { messageId: doc.id }))
	);

	//get Profile of sender:
	const senderProfile = await db.doc(`/users/${senderHandle}`).get();
	if (!senderProfile.exists) {
		return res.status(400).send({ error: 'sender not found' });
	}

	const { bio, createdAt, handle, website, imageUrl } = senderProfile.data();

	res.status(200).send({
		messages,
		senderProfile: { bio, createdAt, handle, website, imageUrl } //omit this to see if it works
	});
});

module.exports = router;
