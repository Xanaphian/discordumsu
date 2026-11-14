// 3D oda modellerini paketler: KayKit (CC0) kaynak paketlerinden seçilen modelleri
// tek tek küçültüp src/renderer/assets/3d altına yazar. Uygulama derlemesinin parçası değildir;
// yalnızca model seçimi değişince elle çalıştırılır.
//
//   1) Kaynak paketleri bir klasöre indir (hepsi github.com/KayKit-Game-Assets altında):
//        KayKit-Character-Pack-Adventures-1.0, KayKit-Furniture-Bits-1.0, KayKit-Restaurant-Bits-1.0,
//        KayKit-City-Builder-Bits-1.0, KayKit-Dungeon-Remastered-1.0, KayKit-Medieval-Hexagon-Pack-1.0,
//        KayKit-Halloween-Bits-1.0
//   2) npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer
//   3) KAYKIT=<klasör> node scripts/3d-paketle.mjs
//
// Kaynak ve lisans listesi: src/renderer/assets/3d/KAYNAKLAR.md
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, meshopt, resample, mergeDocuments, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.env.KAYKIT;
if (!SRC) throw new Error('KAYKIT=<kaynak klasörü> ver');
const OUT = path.resolve(import.meta.dirname, '../src/renderer/assets/3d');
fs.mkdirSync(OUT, { recursive: true });
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const P = {
  adv: 'KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures',
  furn: 'KayKit-Furniture-Bits-1.0/addons/kaykit_furniture_bits/Assets/gltf',
  rest: 'KayKit-Restaurant-Bits-1.0/addons/kaykit_restaurant_bits/Assets/gltf',
  city: 'KayKit-City-Builder-Bits-1.0/addons/kaykit_city_builder_bits/Assets/gltf',
  dung: 'KayKit-Dungeon-Remastered-1.0/addons/kaykit_dungeon_remastered/Assets/gltf',
  hexN: 'KayKit-Medieval-Hexagon-Pack-1.0/addons/kaykit_medieval_hexagon_pack/Assets/gltf/decoration/nature',
  hexP: 'KayKit-Medieval-Hexagon-Pack-1.0/addons/kaykit_medieval_hexagon_pack/Assets/gltf/decoration/props',
  hexB: 'KayKit-Medieval-Hexagon-Pack-1.0/addons/kaykit_medieval_hexagon_pack/Assets/gltf/buildings/blue',
  hall: 'KayKit-Halloween-Bits-1.0/addons/kaykit_halloween_bits/Assets/gltf',
};
const find = (dir, name) => {
  for (const ext of ['.gltf', '.glb', '.gltf.glb']) {
    const f = path.join(SRC, dir, name + ext);
    if (fs.existsSync(f)) return f;
  }
  throw new Error('yok: ' + dir + '/' + name);
};
const dropAnim = (a) => {
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
};
const finish = async (doc, file) => {
  await doc.transform(unpartition(), dedup(), prune({ keepLeaves: true }), weld(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(path.join(OUT, file), doc);
  console.log(file.padEnd(16), (fs.statSync(path.join(OUT, file)).size / 1024).toFixed(0) + ' KB');
};

// ---------------------------------------------------------------- karakterler
const CHARS = { sovalye: 'Knight', barbar: 'Barbarian', buyucu: 'Mage', haydut: 'Rogue', kukuletali: 'Rogue_Hooded' };
for (const [out, name] of Object.entries(CHARS)) {
  const doc = await io.read(path.join(SRC, P.adv, 'Characters/gltf', name + '.glb'));
  for (const a of doc.getRoot().listAnimations()) dropAnim(a);
  // silah, kalkan gibi el eşyaları çıkar; başlık ve pelerin kalır
  for (const n of doc.getRoot().listNodes()) if (n.getMesh() && !n.getSkin() && !/Helmet|Hat|Cape/.test(n.getName())) n.dispose();
  await finish(doc, out + '.glb');
}

// ---------------------------------------------------------------- animasyonlar (ortak iskelet)
{
  const KEEP = ['Idle', 'Walking_A', 'Running_A', 'Sit_Chair_Idle', 'Jump_Idle'];
  const doc = await io.read(path.join(SRC, P.adv, 'Characters/gltf/Knight.glb'));
  for (const a of doc.getRoot().listAnimations()) {
    if (!KEEP.includes(a.getName())) {
      dropAnim(a);
      continue;
    }
    for (const ch of a.listChannels()) {
      const bone = ch.getTargetNode()?.getName() || '';
      const p = ch.getTargetPath();
      // IK/denetim kemikleri görüntüyü etkilemez; ölçek ve (kalça dışındaki) öteleme hep sabit
      if (/IK|control/.test(bone) || p === 'scale' || (p === 'translation' && bone !== 'hips' && bone !== 'root')) {
        const s = ch.getSampler();
        ch.dispose();
        if (s && s.listParents().length <= 1) s.dispose();
      }
    }
  }
  for (const n of doc.getRoot().listNodes()) if (n.getMesh()) n.setMesh(null), n.setSkin(null);
  for (const s of doc.getRoot().listSkins()) s.dispose();
  await doc.transform(resample());
  await finish(doc, 'animasyon.glb');
}

// ---------------------------------------------------------------- eşya kitaplıkları
async function library(file, items) {
  const main = new Document();
  const scene = main.createScene('esyalar');
  main.getRoot().setDefaultScene(scene);
  for (const [name, dir, src] of items) {
    const d = await io.read(find(dir, src || name));
    const map = mergeDocuments(main, d);
    const sc = map.get(d.getRoot().listScenes()[0]);
    const holder = main.createNode(name);
    for (const c of sc.listChildren()) {
      sc.removeChild(c);
      holder.addChild(c);
    }
    sc.dispose();
    scene.addChild(holder);
  }
  for (const s of main.getRoot().listScenes()) if (s !== scene) s.dispose();
  await finish(main, file);
}

await library('salon.glb', [
  ...['couch', 'couch_pillows', 'armchair', 'armchair_pillows', 'table_low', 'table_medium_long', 'table_small', 'chair_A', 'chair_C', 'lamp_standing', 'lamp_table',
    'cabinet_medium', 'cabinet_medium_decorated', 'cabinet_small_decorated', 'shelf_B_large_decorated', 'shelf_B_small_decorated', 'shelf_A_big',
    'pictureframe_large_A', 'pictureframe_large_B', 'pictureframe_medium', 'pictureframe_standing_A', 'cactus_medium_A', 'cactus_medium_B', 'cactus_small_A', 'cactus_small_B',
    'book_set', 'book_single', 'pillow_A', 'pillow_B'].map((n) => [n, P.furn]),
  ['table_round', P.rest, 'table_round_A_small'],
  ['stool', P.rest, 'chair_stool'],
  ['plate', P.rest],
  ['menu', P.rest],
  ['food_burger', P.rest],
  ['mug', P.adv + '/Assets/gltf', 'mug_full'],
  ['bottle', P.dung, 'bottle_A_labeled_green'],
]);

await library('meydan.glb', [
  ...['tree_single_A', 'tree_single_B', 'tree_single_A_cut', 'tree_single_B_cut', 'rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E',
    'cloud_big', 'cloud_small', 'waterlily_A', 'waterlily_B', 'waterplant_A', 'waterplant_B', 'waterplant_C'].map((n) => [n, P.hexN]),
  ...['barrel', 'crate_A_big', 'crate_B_small', 'crate_long_A', 'crate_long_B', 'crate_long_C', 'crate_open', 'sack', 'tent', 'flag_blue', 'flag_green', 'flag_red', 'flag_yellow',
    'bucket_water', 'resource_lumber', 'wheelbarrow', 'pallet'].map((n) => [n, P.hexP]),
  ['well', P.hexB, 'building_well_blue'],
  ['bench', P.hall],
  ['lantern_standing', P.hall],
  ['post_lantern', P.hall],
  ...['path_A', 'path_B', 'path_C', 'path_D'].map((n) => [n, P.hall]),
  ['bush', P.city],
  ['banner_blue', P.dung, 'banner_patternA_blue'],
  ['banner_shield', P.dung, 'banner_shield_blue'],
  ['keg', P.dung],
  ['barrel_stack', P.dung, 'barrel_small_stack'],
  ['chest', P.dung],
  ['mug', P.adv + '/Assets/gltf', 'mug_full'],
]);
