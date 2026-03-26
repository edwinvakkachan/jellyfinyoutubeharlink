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

function buildFileName(title, videoId) {
    const maxTitleLength = 80;

    let shortTitle = title;
    if (title.length > maxTitleLength) {
        shortTitle = title.substring(0, maxTitleLength);
    }

    return `${shortTitle} [${videoId}].mp4`;
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
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

            const srcVideo = path.join(channelPath, `${videoId}.mp4`);
            if (!fs.existsSync(srcVideo)) return;

            const destFolder = path.join(DEST, channel);
            ensureDir(destFolder);

            // Better naming format




            let fileName = buildFileName(title, videoId);

            const destVideo = path.join(destFolder, fileName);

            if (!fs.existsSync(destVideo)) {
                try {
                    execSync(`ln "${srcVideo}" "${destVideo}"`);
                    console.log("Linked:", destVideo);
                } catch (err) {
                    console.log("Error linking:", fileName);
                }
            }
        });
    });
}

function cleanupDeletedVideos() {
    if (!fs.existsSync(DEST)) return;

    const channels = fs.readdirSync(DEST);

    channels.forEach(channel => {
        const channelPath = path.join(DEST, channel);
        const files = fs.readdirSync(channelPath);

        files.forEach(file => {
            if (!file.endsWith(".mp4")) return;

            const destFile = path.join(channelPath, file);

            try {
                const stat = fs.statSync(destFile);

                if (stat.nlink === 1) {
                    fs.unlinkSync(destFile);
                    console.log("Removed orphan:", destFile);
                }
            } catch (e) {}
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