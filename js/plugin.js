"use strict";

const fs = require('fs');


const getConfigPath = async () => {
	const userDataPath = await eagle.app.getPath('userData');
	const pluginName = 'dpvw';
	const pluginDir = `${userDataPath}/${pluginName}`;
	const configFilePath = `${pluginDir}/config.json`;
	fs.readdir(pluginDir, (err, files) => {
		if (err) {
			fs.mkdirSync(pluginDir);
		}
	});
	return configFilePath;
};


const getConfig = async () => {
	const configPath = await getConfigPath();
	if (fs.existsSync(configPath)) {
		try {
			return JSON.parse(fs.readFileSync(configPath, 'utf8'));
		}
		catch (e) {
			console.error(e);
		}
	}
	return {
		username: 'Eagle',
		checkInterval: 60,
	};
}


const saveConfig = async (data) => {
	const configPath = await getConfigPath();
	const config = await getConfig();
	Object.assign(config, data);
	fs.writeFile(configPath, JSON.stringify(config), (err) => {
		if (err) {
			console.error(err);
		}
	});
}


const onChange = async () => {
	const libraryInput = document.getElementById('library');
	const webhookUrlInput = document.getElementById('webhook');
	const usernameInput = document.getElementById('username');
	const avatarUrlInput = document.getElementById('avatar');
	const checkIntervalInput = document.getElementById('check-interval');

	await saveConfig({
		library: libraryInput.value,
		webhookUrl: webhookUrlInput.value,
		username: usernameInput.value,
		avatarUrl: avatarUrlInput.value,
		checkInterval: parseInt(checkIntervalInput.value)
	});
}


const pickRandomItem = async () => {
	const items = await eagle.item.getAll();
	let ret = items[Math.floor(Math.random() * items.length)];
	if (ret.isDeleted) {
		return await pickRandomItem();
	}
	return ret;
};


const createTagNamesStr = async tags => {
	const allTagGroups = await eagle.tagGroup.get();
	const allTagObjects = await eagle.tag.get();
	const tagObjects = tags.map(tag => {
		for (const tagObject of allTagObjects) {
			if (tagObject.name == tag) {
				return tagObject;
			}
		}
	});
	let ret = '';

	for (const tagGroup of allTagGroups) {
		const tagNames = tagObjects.filter(tag => tag.groups.includes(tagGroup.id)).map(tag => '`' + tag.name + '`').join(', ');
		if (tagNames) {
			ret += `**${tagGroup.name}**: ${tagNames}\n`;
		}
	}

	return ret;
}


const postItem = async item => {
	const config = await getConfig();
	let folderNames = [];
	for (const folderId of item.folders) {
		const folder = (await eagle.folder.get({ id: folderId }))[0];
		folderNames.push('`' + folder.name + '`');
	}
	const folderNamesStr = folderNames.join(', ');
	const tagNamesStr = await createTagNamesStr(item.tags);

	let fields = [];
	if (folderNamesStr) {
		fields.push({ name: 'Folders', value: folderNamesStr });
	}
	if (tagNamesStr) {
		fields.push({ name: 'Tags', value: tagNamesStr });
	}

	let embed = {
		title: `Pickup (${new Date().toLocaleDateString('ja-JP', {year: 'numeric', month: '2-digit', day: '2-digit'})})`,
		color: 0x0072ef,
		image: { url: 'attachment://image.png' },
		fields: fields,
		footer: { text: `Added at: ${new Date(item.importedAt).toLocaleDateString('ja-JP', {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'})}` }
	}
	if (item.url) {
		embed.url = item.url;
	}

	const payload = {
		username: config.username,
		avatar_url: config.avatarUrl,
		embeds: [embed]
	};

	fs.readFile(item.filePath, async (err, data) => {
		const formData = new FormData();
		formData.append('file', new Blob([data], { type: 'image/png' }), 'image.png');
		formData.append('payload_json', JSON.stringify(payload));

		const response = await fetch(config.webhookUrl, {
			method: 'POST',
			body: formData
		});
		const result = await response.json();
		console.log(result);
	});
};


eagle.onPluginCreate(async plugin => {
	const libraryInput = document.getElementById('library');
	const webhookUrlInput = document.getElementById('webhook');
	const usernameInput = document.getElementById('username');
	const avatarUrlInput = document.getElementById('avatar');
	const checkIntervalInput = document.getElementById('check-interval');

	const config = await getConfig();
	libraryInput.value = config.library;
	webhookUrlInput.value = config.webhookUrl;
	usernameInput.value = config.username;
	avatarUrlInput.value = config.avatarUrl;
	checkIntervalInput.value = config.checkInterval;

	setInterval(async () => {
		const library = await eagle.library.info();
		const currentConfig = await getConfig();
		if (library.path == currentConfig.library) {
			const now = new Date();
			const lastPostedAt = new Date(currentConfig.lastPostedAt);
			if (now.toDateString() != lastPostedAt.toDateString()) {
				const item = await pickRandomItem();
				await postItem(item);
				await saveConfig({lastPostedAt: now.toISOString()});
			}
		}
	}, config.checkInterval * 1000);
});