/* eslint-disable consistent-return */
const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const firebase = require('firebase'); //* used for firebase authentication
const { readPosts, router } = require('./routes/posts');
const usersRoute = require('./routes/users');
const firebaseConfig = require('./utils/config');
const { db } = require('./utils/admin');
firebase.initializeApp(firebaseConfig);

const app = express();
app.use(cors());

//* register our routes with express
app.use(router);

app.use(usersRoute);

app.get('/readPosts', readPosts);

// * Application endpoints with route handlers
exports.helloWorld = functions.https.onRequest((request, response) => {
	response.send('Hello from Firebase!');
});

//? https://baseurl.com/api/
exports.api = functions.region('europe-west2').https.onRequest(app);

// ? Database triggers
//?-- create notifications on like
exports.createNotificationOnLike = functions
	.region('europe-west2')
	.firestore.document('likes/{id}')
	.onCreate(async snapshot => {
		// onCreated returns a snapshot of the document created
		//when a like is created...
		try {
			//*get the post associated with the like
			// contains a snapshot of the like document that has been created
			const likedPost = await db.doc(`/posts/${snapshot.data().postId}`).get();

			if (
				likedPost.exists &&
				likedPost.data().userHandle !== snapshot.data().userHandle
			) {
				// .set() writes to the document refered to by the document reference
				await db.doc(`/notifications/${snapshot.id}`).set({
					createdAt: new Date().toISOString(),
					recepient: likedPost.data().userHandle,
					sender: snapshot.data().userHandle,
					type: 'Like',
					read: false,
					postId: likedPost.id
				});
				return;
			}
		} catch (e) {
			return;
		}
	});

exports.createNotificationOnComment = functions
	.region('europe-west2')
	.firestore.document('comments/{id}')
	.onCreate(async snapshot => {
		//a snapshot of the document created
		try {
			// a snapshot of the comment created

			// get the post associated with the comment
			const commentedPost = await db
				.doc(`/posts/${snapshot.data().postId}`)
				.get();
			if (
				commentedPost.exists &&
				commentedPost.data().userHandle !== snapshot.data().userHandle
			) {
				await db.doc(`/notifications/${snapshot.id}`).set({
					createdAt: new Date().toISOString(),
					recepient: commentedPost.data().userHandle,
					sender: snapshot.data().userHandle,
					type: 'Comment',
					read: false,
					postId: commentedPost.id
				});
			}
		} catch (e) {
			return;
		}
	});

// ? Delete notification on unlike, adding a database trigger

exports.deleteNotificationOnUnlike = functions
	.region('europe-west2')
	.firestore.document('likes/{id}')
	.onDelete(async snapshot => {
		// snapshot.data
		//when a like is deleted, we need to remove it from notifications.
		try {
			await db.doc(`/notifications/${snapshot.id}`).delete(); //the notification shares the same id as the like: delete it
			return;
		} catch (e) {
			return;
		}
	});

// ? This db trigger changes the userImage on the post after the post owner updates their image url
exports.onUserImageChange = functions
	.region('europe-west2')
	.firestore.document('/users/{id}')
	.onUpdate(async change => {
		//we get back change and context. change has both the snapshots for before and after change
		//change.before.data() && change.after.data()
		if (change.before.data().imageUrl !== change.after.data().imageUrl) {
			let batch = db.batch(); //*make multiple writes

			const posts = await db
				.collection('posts')
				.where('userHandle', '==', change.before.data().handle)
				.get();
			posts.forEach(_post => {
				const post = db.doc(`/posts/${_post.id}`); // document reference
				batch.update(post, { userImage: change.after.data().imageUrl });
			});
			await batch.commit();
		}
	});

//? Delete comments and likes once a post is deleted:
exports.onPostDeleted = functions
	.region('europe-west2')
	.firestore.document('/posts/{id}')
	.onDelete(async (snapshot, context) => {
		try {
			//*context gives us access to the data on the url. the id of the post deleted can be accessed through the url
			const postId = context.params.postId;
			const batch = db.batch();
			const comments = await db
				.collection('comments')
				.where('postId', '==', postId)
				.get();

			comments.forEach(comment => {
				batch.delete(db.doc(`/comments/${comment.id}`)); //takes in the document reference
			});

			const likes = await db
				.collection('likes')
				.where('postId', '==', postId)
				.get();

			likes.forEach(like => {
				batch.delete(db.doc(`/likes/${like.id}`));
			});

			const notifications = await db
				.collection('notifications')
				.where('postId', '==', postId)
				.get();
			notifications.forEach(_notf =>
				batch.delete(db.doc(`/notifications/${_notf.id}`))
			);

			await batch.commit();
		} catch (e) {
			return;
		}
	});
