/* eslint-disable consistent-return */
const validator = require('validator');
const isEmpty = value => {
	return value.trim() === '';
};

exports.validateSignUpData = newUser => {
	//? Validation
	let errors = {};
	if (isEmpty(newUser.email)) {
		errors.email = 'Provide an email ';
	} else if (!validator.isEmail(newUser.email)) {
		errors.email = 'Please provide a valid email';
	}

	if (isEmpty(newUser.password)) errors.password = 'Provide a password';
	if (newUser.password.length < 6)
		errors.password = 'Password must have more than 6 characters';
	if (newUser.password !== newUser.confirmPassword)
		errors.confirmPassword = 'Passwords do not match';

	if (isEmpty(newUser.handle)) errors.handle = 'Provide a user handle';

	return {
		errors,
		valid: Object.keys(errors).length === 0
	};
};

exports.validateLoginData = credentials => {
	let errors = {};

	if (isEmpty(credentials.email)) errors.email = 'Provide an email';
	if (isEmpty(credentials.password)) errors.password = 'Provide a password';

	return {
		errors,
		valid: Object.keys(errors).length === 0
	};
};

exports.reduceUserDetails = data => {
	let userDetails = {};
	//* these extra fields are not required
	if (!isEmpty(data.bio)) userDetails.bio = data.bio;
	if (!isEmpty(data.website)) {
		if (data.website.substring(0, 4) === 'http') {
			userDetails.website = data.website.trim();
		} else userDetails.website = `http://${data.website.trim()}`;
	}
	if (!isEmpty(data.location)) userDetails.location = data.location;

	return userDetails;
};
