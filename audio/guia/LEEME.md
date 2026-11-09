# Voces del guía (luz con carita)

El guía muestra cada frase como texto y además la dice en voz alta:

1. **Si existe el audio grabado** de esa frase, usa ese archivo.
2. Si no, usa **la voz del navegador del visor** en español (si el Quest la tiene).
3. Si tampoco hay voz, queda **solo el texto**.

## Cómo agregar voces grabadas (por ejemplo, grabadas por el equipo)

1. En `frases.csv` está la lista: nombre del archivo y texto de cada frase.
2. Grabar cada frase en un archivo **.mp3**, con el nombre exacto de la primera columna (por ejemplo `bienvenida.mp3`).
   - Voz tranquila, cercana y sin apuro. Unos 0,3 s de silencio al inicio y al final.
3. Subir los .mp3 a esta carpeta (`audio/guia/`).
4. En `manifest.json`, poner la lista de las frases grabadas, por ejemplo:
   `["bienvenida", "calibra", "bien_1", "bien_2"]`
   (sin el `.mp3`). Las frases que no estén en la lista siguen usando la voz del navegador.

Si se cambia el texto de una frase en `guia.js`, hay que volver a grabar su audio.
