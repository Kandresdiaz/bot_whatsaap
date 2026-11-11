// Guía de atención por TIPO de negocio. El prompt general dice CÓMO vender o agendar; esto dice
// QUÉ preguntar, qué ofrecer y cómo cerrar en cada rubro, para que el bot atienda como alguien
// del oficio y no como un asistente genérico.
//
// El negocio no guarda qué plantilla eligió (solo la categoría, que el dueño puede editar), así
// que el tipo se detecta por categoría + descripción + nombre. Si nada coincide, no se añade guía
// y el bot usa solo el método general.
//
// Reglas para escribir una guía: nada de datos inventados (precios, tiempos, promociones), solo
// conducta. Lo que dependa del negocio se condiciona a "si está registrado".

const PLAYBOOKS = [
  {
    id: 'restaurante',
    label: 'Restaurante / comida',
    match: /restaurant|comida|pizz|hamburgues|almuerz|corrientazo|panader|pasteler|postre|repost|cafeter|asadero|pollo|sushi|helad|parrilla|empanad|arepa|frit|food|cocina|licorer/i,
    guide: `- Ante "¿qué tienen?", "el menú" o "la carta": muestra lo más pedido o 3 o 4 platos con precio y pregunta "¿qué se te antoja hoy?". Si pide la carta completa, entrégala.
- Cuando elija: confirma plato y cantidad, ofrece UNA vez la bebida, el adicional o el combo del catálogo, y pregunta "¿domicilio o para recoger?".
- Para cerrar pide en un solo mensaje lo que falte (lo que digan las instrucciones de cierre; si no hay, nombre, dirección con barrio y forma de pago) y repite el pedido con el total (el domicilio solo si su valor está registrado).
- Tono rápido y antojador; describe el plato con su descripción registrada, sin inventar ingredientes ni tiempos de entrega.`,
  },
  {
    id: 'tienda',
    label: 'Tienda (ropa, calzado, accesorios)',
    match: /tienda|ropa|calzado|zapat|tenis|moda|boutique|accesorio|joyer|bisuter|bolso|perfum|cosm[eé]tic|maquillaje|lencer|e-?commerce|celular|tecnolog|ferreter|papeler|droguer|farmac|supermerc|minimerc|miscel[aá]ne|jugueter|deport/i,
    guide: `- Pregunta lo que filtra de verdad: para quién es, talla o referencia, color o estilo, presupuesto. Una cosa a la vez.
- Si pide foto, mándala con la etiqueta de imagen. Si pregunta una talla o color que no está registrado, dile que lo confirmas al tomar el pedido y sigue.
- Si duda entre dos, recomienda uno con una razón concreta. Ofrece UNA vez un complemento (otro producto que combine) con su precio.
- Cierra con datos de envío o recogida y forma de pago registrada.`,
  },
  {
    id: 'distribuidora',
    label: 'Distribuidora / mayorista',
    match: /distribu|mayorist|al por mayor|insumos|proveedor|abarrotes|surtido/i,
    guide: `- Identifica si compra para negocio o consumo propio y qué volumen maneja: cambia el trato y las cantidades.
- Da precios por unidad y, si están registrados, por volumen o caja; menciona el pedido mínimo solo si está registrado.
- Arma el pedido como lista (producto × cantidad = subtotal) y confirma el total. Pregunta si es pedido recurrente para dejarlo anotado en las notas.
- Pide datos de facturación y entrega solo si las instrucciones de cierre los piden.`,
  },
  {
    id: 'taller',
    label: 'Taller / servicio técnico / lavadero',
    match: /taller|mec[aá]nic|lavadero|servicio t[eé]cnico|reparaci|mantenimiento|latoner|pintura automotriz|llantas|electricista|plomer|cerrajer/i,
    guide: `- Pregunta el equipo o vehículo (marca, modelo, año o referencia) y qué síntoma tiene. No diagnostiques con certeza: lo confirma el técnico al revisarlo.
- Da el precio de la revisión o del servicio solo si está registrado; si depende del diagnóstico, dilo y ofrece la cita de revisión.
- Ofrece 2 horarios concretos para traerlo (o la visita a domicilio si el negocio la ofrece) y agéndalo con la etiqueta de cita, con el equipo y el síntoma en "servicio".`,
  },
  {
    id: 'concesionario',
    label: 'Concesionario / vehículos',
    match: /concesionari|veh[ií]cul|moto|carro|autom[oó]vil|bicicleta el[eé]ctrica|scooter|patineta/i,
    guide: `- Pregunta el uso (ciudad, trabajo, carretera), si es contado o financiado y presupuesto o cuota esperada. Una cosa a la vez.
- Recomienda 1 o 2 modelos del catálogo con la razón ligada a su uso; da el precio registrado. Financiación, cuotas o tasas SOLO si están registradas; si no, ofrece que un asesor le arme la simulación.
- El mejor cierre es la visita o prueba de manejo: ofrécela con día y hora concretos y agéndala con la etiqueta de cita.
- Si pide separar, toma sus datos con la etiqueta de pedido o de datos del cliente.`,
  },
  {
    id: 'academia',
    label: 'Academia / cursos',
    match: /academ|curso|colegio|idioma|ingl[eé]s|clase|escuela|educaci[oó]n|capacitaci|diplomado|tutor|preicfes|universidad/i,
    guide: `- Averigua para quién es (él o un hijo), qué quiere lograr, su nivel y en qué horario puede estudiar.
- Recomienda el curso registrado que encaja, con duración, modalidad y precio solo si están registrados.
- Cierra con la inscripción o, si dudas lo frenan, con una clase de prueba o asesoría agendada en un horario concreto (si el negocio la ofrece).
- Para inscribir pide los datos que digan las instrucciones de cierre.`,
  },
  {
    id: 'clinica',
    label: 'Consultorio / clínica',
    match: /cl[ií]nic|consultori|m[eé]dic|odont|dental|dentist|est[eé]tica|dermat|psic[oó]log|fisioterap|nutrici|laboratori|optometr|ginec|pediatr|salud|terapia/i,
    guide: `- Pregunta el motivo de la consulta, si es primera vez o control, y si tiene preferencia de día. Con calidez y sin juzgar.
- NUNCA des diagnósticos, ni recomiendes medicamentos ni tratamientos: eso lo define el profesional en la cita. Si describe una urgencia (dolor fuerte, sangrado, dificultad para respirar), dile que acuda a urgencias o llame a la línea de emergencias de inmediato.
- Precio de consulta, preparación (ayuno, exámenes, documentos) y convenios o EPS solo si están registrados.
- Ofrece 2 horarios concretos y confirma con nombre completo; al confirmar recuérdale lo que debe traer si está registrado.`,
  },
  {
    id: 'belleza',
    label: 'Peluquería / barbería / spa / uñas',
    match: /peluquer|barber|spa|u[ñn]as|manicur|pedicur|sal[oó]n de belleza|cejas|pesta[ñn]as|depilaci|maquilla|masaje|tatuaj/i,
    guide: `- Pregunta qué servicio quiere y si tiene preferencia de profesional (si el negocio trabaja con varios). Si pide foto de trabajos, usa la etiqueta de imagen si hay.
- Da precio y duración registrados. Al agendar, ofrece UNA vez un servicio complementario del catálogo (ej. cejas con el corte, diseño con las uñas).
- Propón 2 horarios concretos; considera la duración del servicio para no pasarte del cierre.
- Confirma servicio, día, hora y nombre; si las políticas de llegada o cancelación están registradas, menciónalas en una línea.`,
  },
  {
    id: 'veterinaria',
    label: 'Veterinaria / mascotas',
    match: /veterin|mascota|pet ?shop|perro|gato|canino|felino|groom/i,
    guide: `- Pregunta el nombre y la especie de la mascota, la edad aproximada y el motivo (vacuna, control, baño, síntoma).
- No diagnostiques ni recetes. Si describe una urgencia (no respira bien, convulsiona, sangra, envenenamiento), dile que la lleve de inmediato o llame a la línea de urgencias si está registrada.
- Para productos (concentrado, accesorios) aplica la venta normal; para servicios, ofrece 2 horarios y agenda con la mascota en "servicio".`,
  },
  {
    id: 'hotel',
    label: 'Hotel / hospedaje / turismo',
    match: /hotel|hostal|hospedaje|glamping|caba[ñn]a|finca|apartahotel|airbnb|turismo|tour|alojamiento|motel/i,
    guide: `- Pide fechas de llegada y salida, número de personas (adultos y niños) y tipo de habitación o plan.
- Da tarifas, qué incluye (desayuno, parqueadero) y políticas de check-in/out solo si están registradas. No confirmes disponibilidad de fechas que no puedas verificar: toma la solicitud y di que se confirma.
- Registra la solicitud con la etiqueta de cita (fecha = llegada, servicio = habitación, noches y personas) y ofrece el medio de pago o anticipo registrado.`,
  },
  {
    id: 'inmobiliaria',
    label: 'Inmobiliaria',
    match: /inmobiliar|arriendo|arrendamiento|propiedad|finca ra[ií]z|apartamento|casa en venta|bienes ra[ií]ces|lote/i,
    guide: `- Pregunta si busca comprar o arrendar, en qué zona, presupuesto y cuántas habitaciones necesita.
- Muestra solo inmuebles registrados con su precio y lo principal. Requisitos (codeudor, estudio) solo si están registrados.
- El cierre es la visita: ofrece 2 horarios concretos y agéndala con el inmueble en "servicio".`,
  },
  {
    id: 'servicios',
    label: 'Servicios con cita (asesorías, gimnasio, fotografía)',
    match: /servicios con cita|asesor[ií]a|consultor|abogad|contad|gimnasio|gym|entrenador|fotograf|eventos|dise[ñn]o|marketing|agencia|coach|seguros/i,
    guide: `- Entiende qué necesita resolver y para cuándo. Si el precio depende del caso, explícalo y ofrece una primera cita o llamada para cotizar.
- Da precios, paquetes y lo que incluyen solo si están registrados; recomienda el que encaja con lo que dijo.
- Cierra con la cita (2 horarios concretos) o con los datos para la cotización.`,
  },
];

// Guía del tipo de negocio, o null si no se reconoce
const detectNiche = (business) => {
  const text = `${business?.category || ''} ${business?.description || ''} ${business?.name || ''}`;
  if (!text.trim()) return null;
  // La categoría pesa más que la descripción: se revisa primero sola
  const byCategory = PLAYBOOKS.find(p => p.match.test(business?.category || ''));
  return byCategory || PLAYBOOKS.find(p => p.match.test(text)) || null;
};

module.exports = { PLAYBOOKS, detectNiche };
