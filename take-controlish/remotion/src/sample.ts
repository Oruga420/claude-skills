import {Spec} from './types';

/**
 * Silent sample used by `remotion studio` and by `--smoke` renders.
 * The real spec is written by scripts/package.py and passed with --props.
 * Everything below is a fictional example (Acme order-sync service).
 */
export const sampleSpec: Spec = {
  title: 'Que el sync de pedidos de Acme no pierda ninguno',
  subtitle: 'Ultraplan fusilado por judge-charly y convertido en contrato de loop',
  date: '2026-01-15',
  mode: 'controlish',
  fps: 30,
  objective:
    'Que ningun pedido de la tienda se pierda cuando la API del proveedor falla. La medicion decide el tamano del plan: si los fallos son solo timeouts cortos, alcanza con reintentos y el plan lo dice.',
  notScope: [
    'No se cambia el esquema de la base de pedidos',
    'Ningun merge ni deploy sin go puntual del operador',
    'No se escribe en produccion: todo se prueba en el entorno de pruebas',
  ],
  phases: [
    {n: 1, name: 'Medir la cota', detail: 'Responder con 30 dias de logs si los fallos son timeouts cortos o caidas largas.'},
    {n: 2, name: 'Inventario de fallos', detail: 'Clasificar cada pedido perdido por causa, separando duplicados de faltantes.'},
    {n: 3, name: 'Cola con reintentos', detail: 'Encolar cada pedido y reintentar con espera creciente, con tope y cola de muertos.'},
    {n: 4, name: 'Rama propia y PR', detail: 'Pushear rama propia, abrir PR sin squash, sin mergear.'},
  ],
  judge: {
    score: 9.2,
    rounds: 2,
    claims: [
      {claim: 'Los fallos son solo timeouts cortos', verdict: 'SURVIVED'},
      {claim: 'Reintentar nunca duplica un pedido', verdict: 'KILLED'},
      {claim: 'El cliente HTTP ya no reintenta por su cuenta', verdict: 'KILLED'},
      {claim: 'Los dos workers en los logs son dos versiones', verdict: 'KILLED'},
      {claim: 'El cron sobrevive un redeploy', verdict: 'UNVERIFIABLE'},
    ],
    changes: [
      'Se agrego una clave de idempotencia por pedido, que el plan original no tenia.',
      'El reintento propio del cliente HTTP se apaga para no reintentar dos veces.',
      'El criterio "verificar que no se pierdan pedidos" se reescribio como comando con salida exacta.',
    ],
  },
  contract: {
    name: 'acme-order-sync-queue',
    path: 'loops/acme-order-sync-queue/README.md',
    acceptance: [
      {check: 'pytest tests/test_order_queue.py', green: '0 failed, incluido el caso de pedido duplicado'},
      {check: 'python scripts/replay_failures.py --days 30 --dry-run', green: 'reporta 0 pedidos sin encolar'},
      {check: 'systemctl status acme-order-sync', green: 'active (running) y ultimo ciclo < 5 min'},
      {check: 'gh pr view --json state,mergedAt', green: 'state OPEN y mergedAt null'},
    ],
  },
  status: {
    headline: 'El contrato esta listo para tu revision',
    detail:
      'El ultraplan paso con 9.2 despues de dos rondas. El contrato del loop ya tiene cuatro criterios falsables, cada uno con su comando y su salida verde. Nada se ejecuto todavia.',
    next: 'Revisa el contrato en el HTML. Si le das el visto bueno, el loop arranca; si no, decime que criterio cambiar.',
  },
  artifacts: [
    {label: 'Ultraplan', path: 'docs/reports/acme-order-sync-ultraplan.html'},
    {label: 'Contrato', path: 'docs/reports/acme-order-sync-contract.html'},
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
