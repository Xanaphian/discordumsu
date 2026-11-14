// 3D karakter seçimi: seçim yoksa (eski sürüm ya da eski sunucu) kişiye göre hep aynı karakter.
import { AVATAR_MODELS, type AvatarModel } from '../../shared/protocol';

export function modelFor(model: AvatarModel | undefined, seed: string): AvatarModel {
  if (model && AVATAR_MODELS.includes(model)) return model;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_MODELS[h % AVATAR_MODELS.length];
}
