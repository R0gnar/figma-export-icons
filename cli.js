#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const ora = require('ora');
const chalk = require('chalk');
const axios = require('axios');
const getConfig = require('./src/config');
const FigmaApi = require('./src/figma-api');

const spinner = ora();

async function run() {
    const config = await getConfig();
    const client = FigmaApi(config.token);
    spinner.start('Fetching Figma file pages');
    const pages = await client.getFile(config.file, {depth: 1});
    spinner.succeed();
    const removeEmoji = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/gi;
    const page = pages.document.children.find(c => c.name.replace(removeEmoji, '') === config.iconsPage);
    if (!page) {
        console.log(chalk.red.bold(`Page ${config.iconsPage} not found`));
        return;
    }
    spinner.start('Fetching Figma file icons');
    const pageData = await client.getFile(config.file, {ids: page.id, depth: 2});
    spinner.succeed();
    const elements = pageData.document.children.find(c => c.id === page.id).children;
    const icons = [];
    elements.forEach(item => {
        const nameParts = item.name.split('/');
        const type = nameParts[0].trim();
        if (type === config.iconPrefix) {
            icons.push(item);
        }
    });
    if (icons.length === 0) {
        console.log(chalk.red.bold(`Icons not found on page ${config.page}`));
        process.exit(1);
    }
    checkDuplicates(icons);
    checkDeleted(icons, config.typingsFilePath);
    saveIconTypings(icons, config.typingsFilePath);

    spinner.start('Fetching icons from figma');
    const nodeIds = icons.map(item => item.id);
    const imagesData = await client.getImages(config.file, nodeIds);
    spinner.succeed();
    icons.forEach(item => {
        item.iconUrl = imagesData.images[item.id];
    });
    spinner.start('Download icons from amazon s3');
    const svgIcons = await downloadIcons(icons);
    spinner.succeed();
    saveIcons(svgIcons, config.iconsFilePath);
}

function checkDuplicates(icons) {
    const duplicates = icons.map(item => formatName(item.name))
        .filter((item, index, array) => array.indexOf(item) !== index);
    if (duplicates.length > 0) {
        console.log(chalk.red.bold(`Found duplicates for icons: ${duplicates.join(', ')}`));
    }
}

function checkDeleted(icons, typingsFilePath) {
    const dirname = path.dirname(typingsFilePath);
    const iconsJsonFilePath = path.join(dirname, path.basename(typingsFilePath, '.ts') + '.json');
    const oldIcons = getOldIcons(iconsJsonFilePath);
    const newIconNames = icons.map(item => formatName(item.name));
    const deleted = oldIcons.filter(name => newIconNames.indexOf(name) < 0);
    if (deleted.length > 0) {
        console.log(chalk.red.bold(`Deleted icons: ${deleted.join(' ')}`))
    }
}

function getOldIcons(filePath) {
    if (!fs.existsSync(filePath)) {
        return [];
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

async function downloadIcons(icons) {
    const requests = icons.map(node => downloadIcon(node));
    return Promise.all(requests);
}

async function downloadIcon(node) {
    return new Promise((resolve, reject) => {
        axios.get(node.iconUrl).then(response => {
            const name = formatName(node.name);
            let svg = removeSvgAttribute(response.data,'fill');
            svg = removeSvgAttribute(svg, 'width');
            svg = removeSvgAttribute(svg, 'height');
            svg = svg.replace('<svg', `<symbol id="${name}"`)
                .replace('</svg>', '</symbol>');
            resolve(svg);
        }, reject);
    });
}

function saveIconTypings(icons, typingsFilePath) {
    const dirname = path.dirname(typingsFilePath);
    const iconsJsonFilePath = path.join(dirname, `.${path.basename(typingsFilePath, '.ts')}.json`);
    const iconsNames = icons.map(item => formatName(item.name));
    fs.writeFileSync(iconsJsonFilePath, JSON.stringify(iconsNames));
    const typings = 'export type iconTypes =\n' + iconsNames.map(item => `  '${item}'`).join(' |\n') + ';'
    fs.writeFileSync(typingsFilePath, typings);
}

function saveIcons(icons, filePath) {
    const content = [];
    content.push('<svg aria-hidden="true" style="position: absolute; width: 0; height: 0; overflow: hidden;" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">');
    content.push('<defs>');
    for (const item of icons) {
        content.push(item);
    }
    content.push('</defs>');
    content.push('</svg>');
    fs.writeFileSync(filePath, content.join('\n'));
}

function removeSvgAttribute(svg, tag) {
    const regEx = new RegExp('\\s(' + tag + ')=\\"[\\w#]+\\"', 'ig');
    return svg.replace(regEx, '');
}


function formatName(name) {
    return name.split('/')
        .map(item => item.trim())
        .join(' ')
        .replace(/[^/w[0-9]\s]/ig, '')
        .replace(/\s/ig, '-')
        .toLowerCase()
}

function main() {
    run().then().catch(err => {
        console.error('Error: ', err);
        spinner.fail();
    });
}

main();
