# Fotos 360° de Respira 360

Respira 360 busca aquí una foto por paisaje. Si una foto no está, el juego usa un paisaje pintado por él mismo.

| Archivo | Paisaje |
| --- | --- |
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
