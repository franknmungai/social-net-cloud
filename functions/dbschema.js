// * Data schemas
let db = {
	users: [
		{
			userId: '545e151c51c5ds11',
			email: 'user@gmail.com',
			handle: 'user',
			createdAt: '2019-11-02T06:49:46.781Z',
			imageUrl: 'https:firebase.googleapis...',
			bio: 'Hello world',
			website: 'www.user.com',
			location: 'Nairobi, Ke'
		}
	],
	posts: [
		{
			userHandle: 'user',
			body: 'post body',
			createdAt: 'Thu Oct 31 2019 13:07:47',
			likedCount: 5,
			commentedCount: 2
		}
	],
	comments: [
		{
			userHandle: 'user',
			postId: '51f45e1f5e1',
			body: 'Join Book Readers Club',
			createdAt: '2019-11-02T06:49:46.781Z'
		}
	],
	notifications: [
		{
			recepient: 'User',
			sender: 'John Doe',
			read: true | false,
			postId: 'ew564f1r5f41',
			type: 'Like' | 'Comment',
			createdAt: '2019-11-02T06:49:46.781Z'
		}
	]
};

// * Redux store
credentials = {
	userId: '545e151c51c5ds11',
	email: 'user@gmail.com',
	handle: 'user',
	createdAt: '2019-11-02T06:49:46.781Z',
	imageUrl: 'https:firebase.googleapis...',
	bio: 'Hello world',
	website: 'www.user.com',
	location: 'Nairobi, Ke',
	likes: [],
	comments: []
};
