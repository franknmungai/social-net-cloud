//* this file contains database reference

const admin = require('firebase-admin'); //* firebase admin to access firestore database

// * initialize app, it takes in an optional instance of the app but our instance is already defined in firestore.json
admin.initializeApp();

//* our database reference
const db = admin.firestore();

module.exports = {
	admin,
	db
};
