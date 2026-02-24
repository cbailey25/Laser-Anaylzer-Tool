/**
 * Bin File Parser
 *
 * Parses laser .bin files according to the official format specification.
 *
 * File Format:
 * - File Header (variable size)
 *   - Format + Version: 2 bytes (big-endian network order)
 *     - High byte: format (0x02)
 *     - Low byte: version (0x01)
 *   - Header Size: 2 bytes (big-endian)
 *   - Points per Profile: 2 bytes (big-endian) - P
 *   - Reserved 0: 2 bytes (big-endian)
 *   - Reserved 1: 2 bytes (big-endian)
 *
 * - For each Profile:
 *   - Comment Length: 2 bytes (big-endian) - C
 *   - Comment Data: C bytes (JSON string)
 *   - Profile Data: P × 4 bytes (P points)
 *     - Each point: yOffset (2 bytes), intensity (1 byte), width (1 byte)
 *     - yOffset is in 12.4 fixed-point format (divide by 16.0)
 */

/**
 * @typedef {Object} BinFileHeader
 * @property {number} format - Expected to be 2
 * @property {number} version - Expected to be 1
 * @property {number} headerSize - Size of header in bytes
 * @property {number} pointsPerProfile - Number of points per profile (P)
 * @property {number} reserved0 - Reserved for future use
 * @property {number} reserved1 - Reserved for future use
 */

/**
 * @typedef {Object} ProfilePoint
 * @property {number} column - Column index (0-based)
 * @property {number} yOffset - Y offset in pixels (12.4 decoded to float)
 * @property {number} intensity - Point intensity (0-255)
 * @property {number} width - Point width (0-255, 0 = no data)
 * @property {boolean} valid - Whether this point has data (width > 0)
 */

/**
 * @typedef {Object} LaserProfile
 * @property {number} index - Profile index within the file
 * @property {Object|null} comment - Parsed JSON comment data
 * @property {string} rawComment - Original comment string
 * @property {ProfilePoint[]} points - Array of profile points
 * @property {number} validCount - Number of valid points (width > 0)
 * @property {number} startOffset - Byte offset of this profile in the file
 */

/**
 * @typedef {Object} BinFileData
 * @property {BinFileHeader} header - File header information
 * @property {LaserProfile[]} profiles - Array of laser profiles
 * @property {number} profileCount - Total number of profiles
 */

/**
 * Read a 16-bit unsigned integer in network byte order (big-endian)
 * @param {DataView} view - The DataView to read from
 * @param {number} offset - The byte offset to read from
 * @returns {number} - The 16-bit unsigned integer
 */
function readUInt16BE(view, offset) {
    return view.getUint16(offset, false); // false = big-endian
}

/**
 * Read a 16-bit signed integer in network byte order (big-endian)
 * @param {DataView} view - The DataView to read from
 * @param {number} offset - The byte offset to read from
 * @returns {number} - The 16-bit signed integer
 */
function readInt16BE(view, offset) {
    return view.getInt16(offset, false); // false = big-endian
}

/**
 * Parse a .bin laser file from an ArrayBuffer.
 *
 * @param {ArrayBuffer} buffer - The raw file data
 * @returns {BinFileData}
 * @throws {Error} On invalid file format
 */
export function parseBinFile(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // ---- File Header ----
    if (buffer.byteLength < 12) {
        throw new Error('File too small — must be at least 12 bytes for the header.');
    }

    // Read format and version combined (first 2 bytes, big-endian)
    const formatAndVersion = readUInt16BE(view, 0);
    const format = (formatAndVersion & 0xFF00) >> 8;  // High byte
    const version = formatAndVersion & 0x00FF;        // Low byte

    // Read remaining header fields (all big-endian)
    const headerSize = readUInt16BE(view, 2);
    const pointsPerProfile = readUInt16BE(view, 4);
    const reserved0 = readUInt16BE(view, 6);
    const reserved1 = readUInt16BE(view, 8);

    // Validate header
    if (format !== 2) {
        throw new Error(`Invalid format: ${format} (expected 2).`);
    }

    if (version !== 1) {
        console.warn(`Unexpected version: ${version} (expected 1).`);
    }

    if (pointsPerProfile === 0) {
        throw new Error('Points per profile is 0 — invalid file.');
    }

    console.log(`Header: format=${format}, version=${version}, headerSize=${headerSize}, pointsPerProfile=${pointsPerProfile}`);

    const header = { format, version, headerSize, pointsPerProfile, reserved0, reserved1 };
    const profiles = [];
    let offset = headerSize;
    let profileIndex = 0;
    const MAX_PROFILES = 10000; // Safety limit

    // ---- Parse Profiles ----
    while (offset < buffer.byteLength && profileIndex < MAX_PROFILES) {
        const profileStartOffset = offset;

        // 1. Read Comment Length (2 bytes, big-endian)
        if (offset + 2 > buffer.byteLength) {
            console.warn(`Profile ${profileIndex}: Truncated at comment length`);
            break;
        }
        const commentLength = readInt16BE(view, offset);
        offset += 2;

        // 2. Read Comment Data (JSON)
        let rawComment = '';
        let comment = null;

        if (commentLength > 0) {
            if (offset + commentLength > buffer.byteLength) {
                console.warn(`Profile ${profileIndex}: Comment extends beyond file (${commentLength} bytes at offset ${offset})`);
                break;
            }

            // Read comment bytes
            const commentBytes = bytes.slice(offset, offset + commentLength);
            offset += commentLength;

            // Decode as UTF-8, clean up any issues
            try {
                rawComment = new TextDecoder('utf-8', { fatal: false })
                    .decode(commentBytes)
                    .replace(/\0+$/, ''); // Remove trailing nulls

                // Try to parse as JSON
                try {
                    comment = JSON.parse(rawComment);
                } catch (e) {
                    console.warn(`Profile ${profileIndex}: Failed to parse comment as JSON: ${e.message}`);
                }
            } catch (e) {
                console.warn(`Profile ${profileIndex}: Failed to decode comment: ${e.message}`);
            }
        }

        // 3. Read Profile Data (P × 4 bytes)
        const profileDataSize = pointsPerProfile * 4;

        if (offset + profileDataSize > buffer.byteLength) {
            console.warn(`Profile ${profileIndex}: Truncated profile data (needs ${profileDataSize} bytes, has ${buffer.byteLength - offset})`);
            break;
        }

        // Parse each point (4 bytes each)
        const points = [];
        let validCount = 0;

        for (let col = 0; col < pointsPerProfile; col++) {
            const pointOffset = offset + col * 4;

            // Read point data (big-endian)
            const yOffsetRaw = readUInt16BE(view, pointOffset);
            const intensity = view.getUint8(pointOffset + 2);
            const width = view.getUint8(pointOffset + 3);

            // Decode 12.4 fixed-point to float
            const yOffset = yOffsetRaw / 16.0;

            // For horizontal profiles, Y is measured from top (inverted)
            // The C# code does: d_yOffset = 1152 - d_yOffset;
            // But we'll keep the raw value and let the application handle orientation

            const valid = width > 0;
            if (valid) validCount++;

            points.push({
                column: col,
                yOffset,
                intensity,
                width,
                valid
            });
        }

        offset += profileDataSize;

        // Add profile to results
        profiles.push({
            index: profileIndex,
            comment,
            rawComment,
            points,
            validCount,
            startOffset: profileStartOffset
        });

        profileIndex++;
    }

    return {
        header,
        profiles,
        profileCount: profiles.length
    };
}

/**
 * Extract the valid points from a profile as pixel coordinates suitable
 * for triangulation. Returns arrays of column (X pixel) and row (Y pixel) values.
 *
 * @param {LaserProfile} profile - The profile to extract points from
 * @param {number} [targetResolution] - Target resolution (not needed for full resolution files)
 * @returns {{ pixelColumns: number[], pixelRows: number[] }}
 */
export function profileToPixelCoords(profile, targetResolution) {
    const pixelColumns = [];
    const pixelRows = [];

    // Use points as-is since we now have the full resolution
    for (const pt of profile.points) {
        if (!pt.valid) continue;
        pixelColumns.push(pt.column);
        pixelRows.push(pt.yOffset);
    }

    return { pixelColumns, pixelRows };
}
