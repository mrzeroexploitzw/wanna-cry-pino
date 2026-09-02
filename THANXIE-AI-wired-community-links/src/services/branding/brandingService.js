import fs from 'node:fs';
import crypto from 'node:crypto';
import { db, now } from '../../database/db.js';
import { defaults } from '../../../config/defaults.js';
import { createProfileUploadSession, uploadProfileImageData, updateBusinessProfileImage } from '../meta/metaClient.js';

export function getActiveBrandImage() {
  const row = db.prepare('SELECT * FROM branding WHERE id=1').get();
  return {
    mediaId: row?.brand_image_media_id || process.env.DEFAULT_BRAND_IMAGE_MEDIA_ID || null,
    url: row?.brand_image_url || null,
    path: defaults.defaultBrandImagePath || process.env.DEFAULT_BRAND_IMAGE_PATH || './assets/branding/thanxie-default.png',
    hash: row?.brand_image_hash || null,
    theme: defaults.brandTheme,
    primary: defaults.brandPrimary,
    accent: defaults.brandAccent,
    background: defaults.brandBackground,
    text: defaults.brandText,
    profilePictureHandle: row?.profile_picture_handle || null,
  };
}

export function activateBrandImage({ mediaId = null, url = null, filePath = null, updatedBy }) {
  const hash = filePath && fs.existsSync(filePath) ? crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex') : null;
  const t = now();
  db.prepare(`UPDATE branding SET brand_image_media_id=?, brand_image_url=?, brand_image_hash=?, brand_image_updated_at=?, brand_image_updated_by=? WHERE id=1`).run(mediaId, url, hash, t, updatedBy);
  return getActiveBrandImage();
}

export function resetBranding(updatedBy) {
  const t = now();
  db.prepare(`UPDATE branding SET brand_image_media_id=?, brand_image_url=NULL, brand_image_hash=NULL, brand_image_updated_at=?, brand_image_updated_by=? WHERE id=1`).run(process.env.DEFAULT_BRAND_IMAGE_MEDIA_ID || null, t, updatedBy);
  return getActiveBrandImage();
}


export async function activateBusinessProfileImage({ buffer, updatedBy, fileName = 'thanxie-profile.jpg' }) {
  const uploadId = await createProfileUploadSession({ fileLength: buffer.length, fileType: 'image/jpeg', fileName });
  const handle = await uploadProfileImageData(uploadId, buffer, 'image/jpeg');
  await updateBusinessProfileImage(handle);
  const t = now();
  db.prepare('UPDATE branding SET profile_picture_handle=?, brand_image_updated_at=?, brand_image_updated_by=? WHERE id=1').run(handle, t, updatedBy);
  return getActiveBrandImage();
}
