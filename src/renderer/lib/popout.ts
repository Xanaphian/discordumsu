// Ayrı pencere (kanal / özel mesaj kendi penceresinde): adresteki ?popout=1&cid=..&ch=..
const q = new URLSearchParams(location.search);
export const IS_POPOUT = q.get('popout') === '1';
export const POPOUT = IS_POPOUT ? { cid: q.get('cid') || '', ch: q.get('ch') || '' } : null;
