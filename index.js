const fs = require('fs');
const https = require('https');
const url = require('url');
const Hipchatter = require('hipchatter');
const yaml = require('js-yaml');
const yargs = require('yargs');

const PAGINATION_WAIT_TIME = 1000;
const PAGINATION_LIMIT = 1000;


/**
 * get large emoticon url
 *
 * @param {Object} emoticon - hipchat emoticon resource
 * @return {Object}
 */
async function getEmoticonUrl(emoticon) {
  const existsImage = src => {
    const {hostname, pathname: path, protocol}= url.parse(src);
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname,
        path,
        method: 'HEAD'
      }, res => {
        resolve(res.statusCode === 200);
      });
      req.on('error', err => reject(err));
      req.end();
    });
  }
  const parsed = emoticon.url.split('.');
  const ext = parsed.slice(-1)[0]
  const prefix = parsed.slice(0, -1).join('.');
  for (let size of ['4', '2']) {
    const src = `${prefix}@${size}x.${ext}`;
    if (await existsImage(src)) {
      return src;
    };
  }
  return emoticon.url;
}


/**
 * getEmoticons
 *
 * @param {Object} params - params
 * @param {string} params.token - HipChat Auth token
 * @param {string} params.type - HipChat emoticon type (all, group, global)
 * @return {Array}
 */
function getEmoticons(params) {
  function pagination(limit, index) {
    return new Promise((resolve, reject) => {
      const hipchatter = new Hipchatter(params.token);
      hipchatter.emoticons({'max-results': limit, 'start-index': index, type: params.type}, async (err, rawEmoticons) => {
        if (err) {
          return reject(err);
        }
        const emoticons = await Promise.all(rawEmoticons.map(async emoticon => {
          const largeUrl = await getEmoticonUrl(emoticon);
          return Object.assign({}, emoticon, {largeUrl});
        }));
        if (emoticons.length < limit) {
          return resolve(emoticons);
        }
        setTimeout(() => {
          pagination(limit, index + limit).then(ems => resolve(emoticons.concat(ems)));
        }, PAGINATION_WAIT_TIME);
      });
    });
  };
  return pagination(PAGINATION_LIMIT, 0);
}

/**
 * storeEmoticons
 *
 * @param {string} emoticons - HipChat emoticons data
 * @param {string} filePath - a file path to save JSON
 */
function dumpEmoticonsForEmojipack(emoticons, filePath) {
  const emojis = emoticons.map(emoticon => {
    return {name: emoticon.shortcut, src: emoticon.largeUrl.trim()};
  });
  const data = yaml.dump({emojis, title: 'HipChat'}, {noCompatMode: true});
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, data, err => {
      if (err) {
        return reject(err);
      }
      return resolve();
    });
  });
}

/**
 * generateEmojiPage
 *
 * @param {Array} emojis - emoji list
 * @param {string} filePath - file path
 */
function generateEmojiPage(emojis, filePath) {
  const rows = emojis.map(emoji => {
    return `
      <tr>
        <td>${emoji.name}</td>
        <td><img src="${emoji.src}" /></td>
      </tr>
      `;
  }).join('\n');
  const html = `
    <html>
      <table>
        <thead>
          <th>Name</th>
          <th>Image</th>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </html>
  `;
  fs.writeFile(filePath, html, err => {
    if (err) {
      throw err;
    }
  });
}

yargs
  .command('dump', 'dump HipChat emoticions', {
    output: {
      desc: 'output file path',
      default: './emoji.yml'
    },
    token: {
      demandOption: true,
      desc: 'HipChat API Token'
    },
    type: {
      'default': 'group',
      desc: 'HipChat Emoticon type'
    }
  }, async argv => {
    console.log('fetching...');
    const emoticons = await getEmoticons({token: argv.token, type: argv.type});
    await dumpEmoticonsForEmojipack(emoticons, argv.output);
    console.log('dumped: ', argv.output);
  })
  .command('html', 'generate emoji page', {
    input: {
      desc: 'input yaml file path',
      default: './emoji.yml'
    },
    output: {
      desc: 'output file path',
      default: './emoji.html'
    }
  }, async argv => {
    const data = yaml.load(fs.readFileSync(argv.input));
    generateEmojiPage(data.emojis, argv.output);
    console.log('generated: ', argv.output);
  })
  .help()
  .argv;
