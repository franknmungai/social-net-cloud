/* eslint-disable consistent-return */
const express = require('express');
const { db } = require('../utils/admin');
const FBAuth = require('../middleware/Auth');
const router = new express.Router();

//* fetch posts from firebase
const readPosts = async (req, res) => {
	try {
		let posts = [];
		const data = await db
			.collection('posts')
			.orderBy('createdAt', 'desc') //* sort docs
			.get(); //* data contains our query snapshot document reference use .data() to get fields out of the document

		data.forEach(doc =>
			// posts.push({
			// 	// id: doc.id,
			// 	// userHandle: doc.data().userHandle,
			// 	// body: doc.data().body,
			// 	// createdAt: doc.data().createdAt,
			// 	// userImage: doc.data().userImage

			// })
			posts.push(Object.assign({}, doc.data(), { postId: doc.id }))
		);
		return res.json(posts);
	} catch (e) {
		console.error(e);
	}
};

// ? get single post by id (together with comments on it)
router.get('/post/:postId', (req, res) => {
	let postData = {};

	db.doc(`/posts/${req.params.postId}`) //get document
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(400).send({ error: 'Post Not Found' });
			}
			postData = doc.data(); // an object containing all the fields in the document
			postData.postId = doc.id; //get post id
			return db
				.collection('comments')
				.where('postId', '==', req.params.postId)
				.orderBy('createdAt', 'desc')
				.get(); //get comments on the post, returns a query snapshot
		})
		.then(comments => {
			postData.comments = [];

			comments.forEach(comment => postData.comments.push(comment.data()));

			return res.json(postData);
		})
		.catch(e => res.status(500).send({ error: 'Error ' + e }));
});

// ? Create a new post
router.post('/newPost', FBAuth, (req, res) => {
	if (req.body.body.trim() === '')
		return res.status(400).send({ comment: 'Body must not be empty' });

	const newPost = {
		body: req.body.body,
		userHandle: req.user.handle,
		createdAt: new Date().toISOString(), //* set a date field value
		userImage: req.user.imageUrl,
		likeCount: 0,
		commentCount: 0
	};

	db.collection('posts')
		.add(newPost)
		.then(doc => {
			newPost.id = doc.id;
			return res.json(newPost);
		})
		.catch(e => res.status(500).json({ Error: e }));
});

//TODO Deleting a post
//TODO Like a post
// TODO Unlike a post
// TODO Comment on a post

//? Comment on a post

router.post('/post/:postId/comment', FBAuth, (req, res) => {
	if (req.body.body.trim() === '')
		return res.json({ error: 'Comment must not be empty' });

	const newComment = {
		userHandle: req.user.handle,
		postId: req.params.postId,
		body: req.body.body,
		createdAt: new Date().toISOString(),
		userImage: req.user.imageUrl
	};

	db.doc(`/posts/${req.params.postId}`)
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).send({ error: 'Post not found' });
			}
			//update the commentCount field on the post
			return doc.ref.update({ commentCount: doc.data().commentCount + 1 }); //* a document reference to the doc location
		})
		.then(() => {
			return db.collection('comments').add(newComment); //add a new comment to the collection
		})
		.then(() => {
			return res.json(newComment);
		})
		.catch(e => res.status(500).send('Something went wrong: ' + e));
});

// ? Like a post

router.get('/post/:postId/like', FBAuth, (req, res) => {
	//* check if the user has liked the document again
	const likedDoc = db
		.collection('likes')
		.where('userHandle', '==', req.user.handle)
		.where('postId', '==', req.params.postId)
		.limit(1);

	const post = db.doc(`/posts/${req.params.postId}`);
	let newPost;

	post
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).send({ error: 'Post not found' });
			}
			newPost = doc.data();
			newPost.postId = doc.id;
			return likedDoc.get();
		})
		.then(data => {
			if (!data.empty) {
				return res.status(400).send({ error: 'Post already Liked' });
			}
			//if its not liked by the same user, create a new like
			return db.collection('likes').add({
				postId: req.params.postId,
				userHandle: req.user.handle
			});
		})
		.then(() => {
			// newPost.likeCount = 0;
			newPost.likeCount += 1;
			// update the count in the database

			return post.update({ likeCount: newPost.likeCount });
		})
		.then(() => {
			// newPost.comments = []
			// db.collection('comments').where('postId', '==', req.params.postId).get().then((data) => {
			// 	 data.docs.forEach((doc) => newPost.comments.push(doc.data()))

			// })
			return db
				.collection('comments')
				.where('postId', '==', req.params.postId)
				.get();
		})
		.then(data => {
			newPost.comments = [];
			if (data.empty) {
				newPost.comments = [];
			} else {
				data.docs.forEach(doc => newPost.comments.push(doc.data()));
			}
			return res.send(newPost);
		})
		.catch(e => res.status(500).send(e));
});

//? Unlike a post
router.get('/post/:postId/unlike', FBAuth, async (req, res) => {
	try {
		const likedDoc = db
			.collection('likes')
			.where('userHandle', '==', req.user.handle)
			.where('postId', '==', req.params.postId)
			.limit(1);

		let updatedPost;

		//* get the post
		const post = await db.doc(`/posts/${req.params.postId}`).get();
		if (!post.exists) {
			return res.status(404).send({ error: 'Post not found' });
		}
		const likes = await likedDoc.get();
		if (likes.empty) {
			// you can't unlike a post that you have not liked
			return res.status(400).send({ error: 'Post not liked' });
		}
		updatedPost = post.data();
		updatedPost.postId = post.id;
		updatedPost.likeCount -= 1;
		//decrement like count on the post
		await db
			.doc(`/posts/${req.params.postId}`)
			.update({ likeCount: updatedPost.likeCount });

		updatedPost.comments = [];
		const comments = await db
			.collection('comments')
			.where('postId', '==', req.params.postId)
			.get();

		if (comments.empty) {
			updatedPost.comments = [];
		} else {
			comments.docs.forEach(doc => updatedPost.comments.push(doc.data()));
		}

		// delete the like from the database
		await db.doc(`/likes/${likes.docs[0].id}`).delete();
		res.send(updatedPost);
	} catch (e) {
		res.status(500).send(e);
	}
});

//TODO combine like and unlike into a single route...

// ? Delete post
router.delete('/post/:postId', FBAuth, (req, res) => {
	const document = db.doc(`/posts/${req.params.postId}`);

	document
		.get()
		.then(post => {
			if (!post.exists)
				return res.status(404).send({ error: 'Post not found' });

			//if you don't own the post
			if (post.data().userHandle !== req.user.handle)
				return res.status(403).send({ error: 'Forbidden' });

			return document.delete();
		})
		.then(() => {
			return res.send({ message: 'Post deleted' });
		})
		.catch(e => res.status(500).send(e));
});
module.exports = { router, readPosts };
