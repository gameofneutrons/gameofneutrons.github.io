# TURKER

Game of Neutrons takımının TURKER (Toryum Uranyum Kompleks Enerji Reaktörü) tasarımını anlatan tek sayfalık site.
Yayın adresi: https://gameofneutrons.github.io

## Yapı

- `index.html`: sayfa ve metinler. Sıra: önce herkes için kısa anlatım (01 Nedir, nasıl çalışır; 02 Neyi farklı yaptık), sonra ayrıntılar (03 Kor … 09 Ekip). Ayrıntı bölümleri "Kısaca" satırıyla başlıyor; terimlerin açıklaması `class="term"` öğelerinin `data-tip` özniteliğinde.
- `css/style.css`: stil; renkler ve ölçüler en üstteki değişkenlerde
- `js/main.js`: her şeyi başlatır
- `js/nav.js`: sabit üst menü, mobil menü, aktif bölüm, kaydırınca beliren içerik
- `js/stage.js`: 3B modelin kontrolleri (Yakıt/Güç, Kesit, RIA, SCRAM), bilgi etiketi, RIA mini grafiği
- `js/core3d.js`: açılıştaki 3B kor modeli (Three.js)
- `js/coremap.js`: kor haritası ve demet ayrıntısı (ok tuşlarıyla da gezilir)
- `js/charts.js`: sayfadaki grafikler (eksenel güç, k_eff, toryum, yakıt/yavaşlatıcı, berilyum, RIA, LOCA)
- `js/figures.js`: havuzdaki modül şeması
- `js/team.js`: ekip listesi
- `data/core.js`: kor dizilimi, demetlerin çubuk haritaları, demet güçleri; TURKER Serpent girdisinden (`nuscale_core`, `nuscale_assembly`, `nuscale_material`) üretildi
- `data/transients.js`: eksenel güç profili ve RIA güç tablosu (COBRA-TF girdisi), RIA ve LOCA olay zamanları (FDR Tablo 28 ve 30)
- `data/rodshapes.js`: çubuklar girince güç dağılımının nasıl değiştiği (3B modelin güç görünümü için); `tools/rodshapes.mjs` üretiyor, elle düzenlenmez
- `data/scans.js`: tasarım taramaları (toryum, yakıt/yavaşlatıcı, berilyum) ve kontrol çubuğu durumları; her birinin FDR kaynağı dosyada yazılı
- `vendor/`: Three.js r186
- `tools/rodshapes.mjs`: `data/rodshapes.js` dosyasını üreten iki gruplu difüzyon modeli (`node tools/rodshapes.mjs`, birkaç saniye). Çubuklar dışarıdayken dağılımı Serpent'e birebir oturtuyor; çubuk soğurması tüm çubukların Serpent değerine (16 303 pcm) ayarlı. Tek tek grup değerlerini Serpent'e %10 içinde veriyor.

Sayfadaki sayılar takımın Final Değerlendirme Raporu'ndan (FDR) ve analiz girdilerinden alındı. Toryum taramasının değerleri FDR'deki grafiklerden okunduğu için yaklaşıktır; sayfada da böyle belirtiliyor. 3B modelde çubukların güç dağılımına etkisi de yaklaşık bir modelden geliyor; RIA oynatmasında çekilen grup temsili olarak D1 (FDR grubu belirtmiyor).

## Yerelde açmak

Modüller dosyadan (`file://`) yüklenmez, küçük bir sunucu gerekir:

```
python3 -m http.server 8000
```

Sonra tarayıcıda http://localhost:8000 adresini aç.

## Ekip listesini güncellemek

`js/team.js` içindeki `TEAM` dizisine `{ name: 'Ad Soyad', role: 'Görev', link: 'https://...' }` biçiminde ekle. Rolünde "kaptan" ya da "danışman" geçen kartlar ayrı renkte görünür.
