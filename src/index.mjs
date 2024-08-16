import dotenv from 'dotenv';
import puppeteer from 'puppeteer';
import express from 'express';
import { Youtrack } from 'youtrack-rest-client';
import { axiosInstance as axios } from 'youtrack-rest-client/dist/axios.js';
import { TableBuilder } from './table.mjs';
import { generateBoundary } from './utils.mjs';

dotenv.config();

const youtrack = new Youtrack({
  baseUrl: process.env.YOUTRACK_URL,
  token: process.env.YOUTRACK_TOKEN,
});

const server = express();
server.use(express.json());

// I don't care what you do, Marker, I *will* use your API
const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.setUserAgent(
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
);

await page.goto('https://app.marker.io/login');

await page
  .waitForSelector("input[id='email']")
  .then(async (el) => el.type(process.env.MARKER_EMAIL));
await page.waitForSelector("button[type='submit']").then(async (el) => await el.click());

await page
  .waitForSelector("input[id='password']")
  .then(async (el) => el.type(process.env.MARKER_PASSWORD));
await page.waitForSelector("button[type='submit']").then(async (el) => el.click());

await page.waitForSelector('.destination-grid');

const cookies = await page.cookies();
await browser.close();

const markerCookie = cookies.find((c) => c.name === 'markersess');
if (!markerCookie) throw new Error('No Marker session cookie found.');

// Now that we've got our cookies, get a list of Marker projects...
// TODO: Figure out if we need to change the `pageSize` and what the upper limit of that is
const res = await (
  await fetch('https://api.marker.io/destinations', {
    headers: {
      Cookie: `markersess=${markerCookie.value}`,
    },
  })
).json();

// Simplify the data we actually need to use and kick it into an array
const markerProjects = [];
for (let dest of res.destinations) {
  const name = dest.reportingSettings.simple.displayName;
  const ytProject = name.split(':')[0];
  markerProjects.push({
    id: dest.id,
    ytProject,
    name: name.split(':')[1].trim(),
  });
}

// And finally, whenever a webhook from Marker comes in, create a YouTrack issue for it
server.post('/', async (req, res) => {
  // TODO: Figure this out, major priority
  // const remoteIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  // console.log(`Request from ${remoteIp}, checking...`);
  // if (remoteIp !== '::ffff:34.246.65.9') {
  //   console.log('Failed! Consider checking the sample issue in Marker to see if their IP changed');
  //   res.status(404).send('Not found');
  // }

  const markerData = req.body;

  const marker = markerProjects.find((p) => p.id === markerData.destination.id);
  const project = await youtrack.projects.byId(marker.ytProject);

  let description = `${markerData.issue.description}\n--\n`;

  // TODO: Figure out what ID we have to use here, because it's not the reporter ID
  // description +=
  //   `**Reported by:** ${markerData.reporter.name} (${markerData.reporter.email})` +
  //   ` - [Contact via Marker.io](https://app.marker.io/i/${markerData.reporter.id}?advanced=1&comments=1)\n`;

  description += `**Source URL:** ${markerData.website.url}\n`;

  description += `**Issue details**: [Open in Marker.io](${markerData.issue.publicUrl})\n\n`;

  let table = new TableBuilder()
    .setHeaders(['Property', 'Value'])
    .addRow(['Device type', markerData.context.contextString.match(/[^,]*$/g)[0].trim()])
    .addRow(['Browser', `${markerData.context.browser.name} ${markerData.context.browser.version}`])
    .addRow([
      'Screen Size',
      `${markerData.context.screenSize.width}x${markerData.context.screenSize.height}`,
    ])
    .addRow([
      'Viewport Size',
      `${markerData.context.viewport.width}x${markerData.context.viewport.height}`,
    ])
    .addRow(['Zoom Level', markerData.context.zoom.zoomFactor ?? '100%'])
    .addRow(['Pixel Ratio', `@${markerData.context.screenSize.pixelRatio}x`])
    .build();
  description += table;

  const issue = await youtrack.issues.create({
    project: {
      id: project.id,
    },
    summary: `[Marker.io] ${markerData.issue.title}`,
    description,
  });

  const image = await (await fetch(markerData.issue.screenshotUrl)).blob();

  // Very hackily manually upload the attachment
  const form = new FormData();
  form.append('upload', image, 'screenshot.jpeg');
  axios.post(`${youtrack.baseUrl}/issues/${issue.id}/attachments`, form, {
    headers: {
      ...youtrack.defaultRequestOptions.headers,
      'Content-Type': `multipart/form-data; boundary=${generateBoundary()}`,
    },
  });

  res.send('OK');
});

server.listen(26663);
