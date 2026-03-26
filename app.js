import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { execSync } from "child_process";
dotenv.config();

const SOURCE = process.env.SOURCE_DIR;
const DEST = process.env.DEST_DIR;

function sanitize(name) {
    return name.replace(/[<>:"/\\|?*]+/g, "").trim();
}

function buildBaseName(title, videoId) {
    const maxTitleLength = 70;
    let shortTitle = title;

    if (title.length > maxTitleLength) {
        shortTitle = title.substring(0, maxTitleLength);
    }

    return `${shortTitle} [${videoId}]`;
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function hardlinkIfExists(src, dest) {
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
        try {
            execSync(`ln "${src}" "${dest}"`);
            console.log("Linked:", dest);
        } catch {
            console.log("Error linking:", dest);
        }
    }
}

function createEpisodeNFO(destFolder, baseName, data) {
    const nfoPath = path.join(destFolder, `${baseName}.nfo`);
    if (fs.existsSync(nfoPath)) return;

    const airedDate = data.upload_date
        ? `${data.upload_date.substring(0,4)}-${data.upload_date.substring(4,6)}-${data.upload_date.substring(6,8)}`
        : "";

    const nfoContent = `
<episodedetails>
    <title>${data.title}</title>
    <plot>${data.description || ""}</plot>
    <studio>${data.uploader}</studio>
    <aired>${airedDate}</aired>
    <id>${data.id}</id>
</episodedetails>
`;

    fs.writeFileSync(nfoPath, nfoContent);
}

function createTVShowNFO(channelFolder, channelName, channelId) {
    const tvshowPath = path.join(channelFolder, `tvshow.nfo`);
    if (fs.existsSync(tvshowPath)) return;

    const content = `
<tvshow>
    <title>${channelName}</title>
    <studio>YouTube</studio>
    <id>${channelId}</id>
</tvshow>
`;

    fs.writeFileSync(tvshowPath, content);
}

function linkVideos() {
    const channels = fs.readdirSync(SOURCE);

    channels.forEach(channelId => {
        const channelPath = path.join(SOURCE, channelId);
        if (!fs.statSync(channelPath).isDirectory()) return;

        const files = fs.readdirSync(channelPath);
        const jsonFiles = files.filter(f => f.endsWith(".info.json"));

        jsonFiles.forEach(jsonFile => {
            const jsonPath = path.join(channelPath, jsonFile);
            const data = JSON.parse(fs.readFileSync(jsonPath));

            const videoId = jsonFile.replace(".info.json", "");
            const title = sanitize(data.title || videoId);
            const channel = sanitize(data.uploader || "YouTube");

            const baseName = buildBaseName(title, videoId);

            const srcVideo = path.join(channelPath, `${videoId}.mp4`);
            const srcSubtitle = path.join(channelPath, `${videoId}.en.srt`);
            const srcThumb = path.join(channelPath, `${videoId}.jpg`);
            const srcJson = path.join(channelPath, `${videoId}.info.json`);

            const channelFolder = path.join(DEST, channel);
            const seasonFolder = path.join(channelFolder, "Season 01");

            ensureDir(seasonFolder);
            createTVShowNFO(channelFolder, channel, channelId);

            const destVideo = path.join(seasonFolder, `${baseName}.mp4`);
            const destSubtitle = path.join(seasonFolder, `${baseName}.srt`);
            const destThumb = path.join(seasonFolder, `${baseName}.jpg`);
            const destJson = path.join(seasonFolder, `${baseName}.info.json`);

            hardlinkIfExists(srcVideo, destVideo);
            hardlinkIfExists(srcSubtitle, destSubtitle);
            hardlinkIfExists(srcThumb, destThumb);
            hardlinkIfExists(srcJson, destJson);

            createEpisodeNFO(seasonFolder, baseName, data);
        });
    });
}

function cleanupDeletedVideos() {
    if (!fs.existsSync(DEST)) return;

    const channels = fs.readdirSync(DEST);

    channels.forEach(channel => {
        const seasonPath = path.join(DEST, channel, "Season 01");
        if (!fs.existsSync(seasonPath)) return;

        const files = fs.readdirSync(seasonPath);

        files.forEach(file => {
            if (!file.endsWith(".mp4")) return;

            const destFile = path.join(seasonPath, file);

            try {
                const stat = fs.statSync(destFile);

                if (stat.nlink === 1) {
                    fs.unlinkSync(destFile);
                    console.log("Removed orphan:", destFile);
                }
            } catch {}
        });
    });
}

function main() {
    console.log("Starting sync...");
    linkVideos();
    cleanupDeletedVideos();
    console.log("Sync complete.");
}

main();