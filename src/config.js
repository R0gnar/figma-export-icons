const fs = require('fs');
const prompts = require('prompts');

const configFileName = '.figma-icons-config.json';
const defaults = {
    token: '',
    file: '',
    page: 'Page 1',
    iconPrefix: 'Icon',
    iconsFilePath: 'icons.html'
};

const configList = [
    {
        type: 'text',
        name: 'token',
        message: 'Figma API token:',
        validate: value => value === '' ? 'Generate a personal token for figma, read here:\nhttps://www.figma.com/developers/docs#authentication' : true,
        initial: defaults.token,
    },
    {
        type: 'text',
        name: 'file',
        message: 'Figma file ID:',
        validate: value => value === '' ? 'Visit figma project in the browser and copy the id:\nhttps://www.figma.com/file/FILE-ID/project-name' : true,
        initial: defaults.file,
    },
    {
        type: 'text',
        name: 'page',
        message: 'Figma page name:',
        validate: value => value === '' ? 'Enter page name' : true,
        initial: defaults.page,
    },
    {
        type: 'text',
        name: 'iconPrefix',
        message: 'Icon prefix:',
        validate: value => value === '' ? 'Enter icon prefix' : true,
        initial: defaults.iconPrefix,
    },
    {
        type: 'text',
        name: 'iconsFilePath',
        message: 'Icons file path:',
        validate: value => value === '' ? 'Enter icons file path' : true,
        initial: defaults.iconsFilePath,
    }
];

async function getConfig() {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(configFileName)) {
           let config = JSON.parse(fs.readFileSync(configFileName, 'utf-8'));
           const missing = configList.filter(q => !config[q.name]);
           if (missing.length > 0) {
               getPromptData(missing).then(data => {
                   config = Object.assign(config, data);
                   saveConfig(config);
                   resolve(config);
               }, reject)
           } else {
               resolve(config);
           }
        } else {
            getPromptData(configList).then(config => {
                saveConfig(config);
                resolve(config);
            }, reject);
        }
    });
}

function getPromptData(list) {
    return prompts(list, {onCancel: () => process.exit(1)});
}

function saveConfig(config) {
    fs.writeFileSync(configFileName, JSON.stringify(config, null, 2));
}

module.exports = getConfig;
