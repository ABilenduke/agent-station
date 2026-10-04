const ESTIMATE = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m)?$/;
/** Parses an estimate such as `1.5h`, `90m` or `1h30m` into whole minutes. */
export function parseEstimate(text) {
    const match = ESTIMATE.exec(text.trim());
    if (!match || (match[1] === undefined && match[2] === undefined)) {
        throw new Error(`Cannot read estimate "${text}"; use forms like 1.5h, 90m or 1h30m.`);
    }
    const hours = match[1] === undefined ? 0 : Number(match[1]);
    const minutes = match[2] === undefined ? 0 : Number(match[2]);
    return Math.round(hours * 60 + minutes);
}
/** Formats minutes as `45m`, `2h` or `1h 30m`, rounded to the nearest minute. */
export function formatMinutes(minutes) {
    const total = Math.round(minutes);
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0)
        return `${m}m`;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
