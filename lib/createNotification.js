export const createNotification = (id, message) => {
	chrome.notifications.create(id, {
		title: "PSA Speedrun",
		message,
		iconUrl: "../icons/favicon-48x48.png",
		type: "basic",
	});
};
