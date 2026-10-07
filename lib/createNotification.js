export const createNotification = (id, message) => new Promise((resolve) => {
	chrome.notifications.create(id, {
		title: "PSA Speedrun",
		message,
		iconUrl: "icons/favicon-48x48.png",
		type: "basic",
	}, (notificationId) => {
		const error = chrome.runtime.lastError;
		if (error) {
			console.error('Could not create notification:', error.message);
			resolve(null);
			return;
		}
		resolve(notificationId);
	});
});
