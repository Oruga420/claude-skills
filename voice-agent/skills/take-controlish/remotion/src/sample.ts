import {Spec} from './types';

/**
 * Silent sample used by `remotion studio` and by `--smoke` renders.
 * The real spec is written by scripts/package.py and passed with --props.
 */
export const sampleSpec: Spec = {
  title: 'Consolidar el servicio de pedidos de Acme en un solo repositorio',
  subtitle: 'Ultraplan fusilado por judge-charly y convertido en contrato de loop',
  date: '2026-09-09',
  mode: 'controlish',
  fps: 30,
  objective:
    'Dejar en git todo lo que hoy vive solo en el servidor del servicio de pedidos de Acme, antes de que la migracion lo deje afuera. La medicion decide el tamano del plan: si el arbol vivo alcanza como fuente de verdad, el trabajo es corto y el plan lo dice.',
  notScope: [
    'No se toca el servidor de git de otro equipo (esta maquina no tiene acceso ahi)',
    'Ningun merge ni deploy sin go puntual del operador',
    'No se escribe en staging: esta congelada',
  ],
  phases: [
    {n: 1, name: 'Medir la cota', detail: 'Responder con evidencia si hacen falta los commits viejos o alcanza el arbol vivo.'},
    {n: 2, name: 'Inventario por ruta', detail: 'Listar los archivos vivos sin git, separados de los respaldos .bak/.prepatch.'},
    {n: 3, name: 'Bits de ejecucion', detail: 'Registrar el modo de los nueve ejecutables que hoy el ancla no guarda.'},
    {n: 4, name: 'Rama propia y MR', detail: 'Pushear rama propia, abrir MR sin squash, sin mergear.'},
  ],
  judge: {
    score: 9.2,
    rounds: 2,
    claims: [
      {claim: 'El arbol vivo alcanza como fuente de verdad', verdict: 'SURVIVED'},
      {claim: 'Los .bak son descartables sin revisar', verdict: 'KILLED'},
      {claim: 'El ancla preserva permisos de ejecucion', verdict: 'KILLED'},
      {claim: 'Los dos sync_orders.py son dos versiones', verdict: 'KILLED'},
      {claim: 'El cron sobrevive una reconstruccion', verdict: 'UNVERIFIABLE'},
    ],
    changes: [
      'Se agrego una fase entera para los bits de ejecucion, que el plan original no tenia.',
      'sync_orders.py salio del planchado y quedo como caso aparte con su advertencia.',
      'El criterio "verificar que todo este en git" se reescribio como comando con salida exacta.',
    ],
  },
  contract: {
    name: 'consolidacion-repo',
    path: 'loops/consolidacion-repo/README.md',
    acceptance: [
      {check: 'git status --porcelain en el servidor', green: 'devuelve cero lineas para las 34 rutas vivas listadas'},
      {check: 'git ls-files -s | grep 100755', green: 'lista los 9 ejecutables, ninguno como 100644'},
      {check: 'systemctl status acme-order-sync', green: 'active (running) y ultimo ciclo < 5 min'},
      {check: 'glab mr list --source-branch', green: 'la MR existe y su merge_method no es squash'},
    ],
  },
  status: {
    headline: 'El contrato esta listo para tu revision',
    detail:
      'El ultraplan paso con 9.2 despues de dos rondas. El contrato del loop ya tiene cuatro criterios falsables, cada uno con su comando y su salida verde. Nada se ejecuto todavia.',
    next: 'Revisa el contrato en el HTML. Si le das el visto bueno, el loop arranca; si no, decime que criterio cambiar.',
  },
  screens: [],
  artifacts: [
    {label: 'Ultraplan', path: 'docs/reports/consolidacion-repo-ultraplan.html'},
    {label: 'Contrato', path: 'docs/reports/consolidacion-repo-contract.html'},
  ],
  bgm: null,
  scenes: [
    {kind: 'title', frames: 150, audio: null},
    {kind: 'objective', frames: 240, audio: null},
    {kind: 'phases', frames: 270, audio: null},
    {kind: 'judge', frames: 300, audio: null},
    {kind: 'contract', frames: 270, audio: null},
    {kind: 'status', frames: 240, audio: null},
  ],
};
