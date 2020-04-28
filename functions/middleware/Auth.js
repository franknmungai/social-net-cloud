const { admin, db } = require('../utils/admin');

//* authentication middleware for firebase authorization:
const FBAuth = async (req, res, next) => {
	if (
		//* if a token is found in the request header
		req.headers.authorization &&
		req.headers.authorization.startsWith('Bearer ')
	) {
		const idToken = req.headers.authorization.replace('Bearer ', '');

		try {
			//* verify the id token. returns decoded token  with fields from our auth db
			const decodedToken = await admin.auth().verifyIdToken(idToken);

			//* append the decodeId token to the req object, contains sub, iss, iat, uid etc
			req.user = decodedToken;

			// .get() executes the query and returns the query on collection as a snapshot(array of docs)
			const data = await db
				.collection('users')
				.where('userId', '==', req.user.uid) //search by field
				.limit(1)
				.get();
			req.user.handle = data.docs[0].data().handle; // .data()  retrieves all fields in the document as an object
			req.user.imageUrl = data.docs[0].data().imageUrl;
			return next();
		} catch (err) {
			console.error('Error while verifying token' + err);
			return res.status(403).send({ err });
		}
	} else {
		return res.status(403).send({ error: 'Unauthorized' }); //* unauthorized
	}
};

module.exports = FBAuth;
