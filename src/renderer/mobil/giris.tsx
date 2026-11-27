// v1.68 telefon uygulamasının girişi. Sıra önemli: önce telefon köprüsü (window.kovan) kurulur, arayüz ondan SONRA
// yüklenir (bazı modüller yüklenirken window.kovan'a bakıyor); telefon düzeninin stilleri en son gelir ki masaüstününkilerin üstüne yazsın.
import './kopru';

import('../main').then(() => import('./duzen'));
