// Perfiles de pacientes (Google Sheets vía Apps Script). Estos dos valores NO son secretos: la seguridad la da el
// ingreso con Google y la lista de correos autorizados que está en el script. Ver calma-apps-script/INSTRUCCIONES.md.
//
// Mientras estén vacíos, la página del terapeuta funciona igual que antes (sin perfiles).
export const PACIENTES_API_URL = ''; // URL de la aplicación web de Apps Script (termina en /exec)
export const GOOGLE_CLIENT_ID = ''; // ID de cliente OAuth de Google (termina en .apps.googleusercontent.com)

export const CONSENT_VERSION = 'v1';
export const CONSENT_TEXT =
  'Confirmo que el paciente fue informado y consiente el tratamiento de sus datos personales y de salud, con acceso ' +
  'restringido al profesional tratante, para su rehabilitación (Ley N° 21.719 y Ley N° 20.584).';
