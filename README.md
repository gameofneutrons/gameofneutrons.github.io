# TURKER

Game of Neutrons takımının TURKER (Toryum Uranyum Kompleks Enerji Reaktörü) tasarımını anlatan tek sayfalık site.
Yayın adresi: https://gameofneutrons.github.io

## Yapı

- `index.html`: sayfa ve metinler
- `css/style.css`: stil
- `js/core3d.js`: açılıştaki 3B kor modeli (Three.js)
- `js/coremap.js`: kor haritası ve demet ayrıntısı
- `js/figures.js`: toryum grafiği ve havuzdaki modül şeması
- `js/team.js`: ekip listesi
- `data/core.js`: kor dizilimi ve demetlerin çubuk haritaları; TURKER Serpent girdisinden (`nuscale_core`, `nuscale_assembly`, `nuscale_material`) üretildi
- `vendor/`: Three.js r186

## Yerelde açmak

Modüller dosyadan (`file://`) yüklenmez, küçük bir sunucu gerekir:

```
python3 -m http.server 8000
```

Sonra tarayıcıda http://localhost:8000 adresini aç.

## Ekip listesini güncellemek

`js/team.js` içindeki `TEAM` dizisine `{ name: 'Ad Soyad', role: 'Görev', link: 'https://...' }` biçiminde ekle.
