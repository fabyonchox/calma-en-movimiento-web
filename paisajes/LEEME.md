# Fotos 360° de Respira 360

Respira 360 busca aquí una foto por paisaje. Si una foto no está, el juego usa un paisaje pintado por él mismo.

| Archivo | Paisaje |
| --- | --- |
| `amanecer.jpg` | Amanecer sereno (Poly Haven «Qwantani Dusk 2 Pure Sky», CC0) — incluida |
| `nubes.jpg` | Cielo con nubes (Poly Haven «Citrus Orchard Pure Sky», CC0) — incluida |
| `atardecer.jpg` | Tarde despejada (Poly Haven «Qwantani Late Afternoon Pure Sky», CC0) — incluida |
| `noche.jpg` | Noche estrellada (Poly Haven «Qwantani Night Pure Sky», CC0) — incluida |
| `playa.jpg` | Playa al amanecer |
| `cascada.jpg` | Río y cascada |
| `pradera.jpg` | Pradera |
| `bosque.jpg` | Bosque |

Requisitos:

- Foto **equirectangular** (proporción 2:1, por ejemplo 4096 × 2048), en JPG.
- **Licencia libre CC0**, por ejemplo de [Poly Haven](https://polyhaven.com/license) (descarga «Tonemapped JPG»). No usar fotos con derechos de autor.
- Sin personas ni textos, y con la cámara quieta (es una foto, así que no hay movimiento de cámara).
- Peso recomendado: menos de 4 MB por foto, para que cargue rápido en el Quest.

Si lo más bonito de la foto no queda al frente, se ajusta el giro en `YAW` dentro de `paisaje360.js`.

Las cuatro fotos de cielo se convirtieron desde los archivos EXR (4K) con un ajuste de tonos suave y exposición
reducida (noche −3,3 pasos; tarde −1; amanecer y nubes −0,7).
