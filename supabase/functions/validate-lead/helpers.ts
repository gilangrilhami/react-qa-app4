export const normalizeSpelledOutName = (text: string): string => {
    return text
        .toLowerCase()
        .replace(/([a-z])\s+([a-z])/g, '$1$2') // Remove spaces between letters (e.g., "j e n" → "jen")
        .replace(/([a-z])-([a-z])/g, '$1$2'); // Remove dashes between letters (e.g., "c-o-l" → "col")
};

export const extractSpelledOutNames = (transcript: string): { firstName: string | undefined; lastName: string | undefined } => {
    const lines = transcript.split('\n');
    let firstName: string | undefined;
    let lastName: string | undefined;

    // Regular expression to match a sequence of letters separated by spaces or dashes (e.g., "j e n n i s e r" or "c-o-l-e-c-i-o")
    const letterSequenceRegex = /^[a-z](?:\s*[a-z]|\-[a-z])*$/i;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();

        // Look for the first name after "can you verify the spelling your first name"
        if (line.includes('can you verify the spelling your first name')) {
            // Look at the next line for the spelled-out name
            if (i + 1 < lines.length) {
                const nextLine = lines[i + 1];
                // Extract the part after the speaker tag (e.g., "[Speaker:3] j e n n i s e r" → "j e n n i s e r")
                const namePart = nextLine.replace(/^\[Speaker:\d+\]\s*/, '').trim();
                if (letterSequenceRegex.test(namePart)) {
                    // Remove spaces and dashes, capitalize the first letter
                    const normalizedName = namePart.replace(/[\s-]/g, '');
                    firstName = normalizedName.charAt(0).toUpperCase() + normalizedName.slice(1).toLowerCase();
                }
            }
        }

        // Look for the last name after "can you please spell your last name"
        if (line.includes('can you please spell your last name')) {
            // Look at the next line for the spelled-out name
            if (i + 1 < lines.length) {
                const nextLine = lines[i + 1];
                // Extract the part after the speaker tag
                const namePart = nextLine.replace(/^\[Speaker:\d+\]\s*/, '').trim();
                if (letterSequenceRegex.test(namePart)) {
                    // Remove spaces and dashes, capitalize the first letter
                    const normalizedName = namePart.replace(/[\s-]/g, '');
                    lastName = normalizedName.charAt(0).toUpperCase() + normalizedName.slice(1).toLowerCase();
                }
            }
        }
    }

    return { firstName, lastName };
};

export const compareStringsLoosely = (str1?: string, str2?: string, isZip: boolean = false): boolean => {
    if (!str1 && !str2) return true;
    if (!str1 || !str2) return false;

    if (isZip) {
        const normalizeZip = (zip: string) => zip.split("-")[0].trim();
        return normalizeZip(str1).toLowerCase() === normalizeZip(str2).toLowerCase();
    }

    return str1.trim().toLowerCase() === str2.trim().toLowerCase();
};