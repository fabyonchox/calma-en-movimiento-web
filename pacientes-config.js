// Perfiles de pacientes (Google Sheets vía Apps Script). Estos dos valores NO son secretos: la seguridad la da el
// ingreso con Google y la lista de correos autorizados que está en el script. Ver calma-apps-script/INSTRUCCIONES.md.
//
// Mientras estén vacíos, la página del terapeuta funciona igual que antes (sin perfiles).
export const PACIENTES_API_URL = 'https://script.google.com/macros/s/AKfycbwZ7w5TteuhixQu3WmEs__F9IDxZf3t3NHn2wpnzSw89XSgO61ezRGwekUm7N6QRg1stA/exec'; // aplicación web de Apps Script
export const GOOGLE_CLIENT_ID = '708117880698-g8hg97f1tv8e9jf29lu3f8d2k3kjsclp.apps.googleusercontent.com'; // ID de cliente OAuth de Google

export const CONSENT_VERSION = 'v1';
export const CONSENT_TEXT =
  'Confirmo que el paciente fue informado y consiente el tratamiento de sus datos personales y de salud, con acceso ' +
  'restringido al profesional tratante, para su rehabilitación (Ley N° 21.719 y Ley N° 20.584).';
