// Drafts for the future operator. Never publish by merely replacing the brand.
// Company identity, operative contacts and final commercial policy need review.
export const legalVersion = "2026-10-26-draft-1";
export const documentState = {
  status: "draft",
  operatorKind: "company",
  companyFormed: false,
  commercialLaunch: false,
  minimumAge: 13,
  householdAdministratorAge: 18,
  requiredBeforePublication: [
    "operator_name",
    "operator_state",
    "operator_address",
    "support_email",
    "privacy_email",
    "copyright_contact",
    "refund_policy",
    "professional_review",
  ],
};
export const plans = {
  free: {
    name: "Skendal Free",
    limits: { members: 4, lists: 3, devices: 1, photos: 3, widgets: 6 },
  },
  pro: {
    name: "Skendal Pro",
    limits: { members: 12, lists: 20, devices: 3, photos: 12, widgets: 64 },
  },
};
export const documents = {
  terms: {
    es: {
      title: "Términos de servicio de Skendal",
      notice:
        "BORRADOR NO VIGENTE. La empresa operadora todavía no está constituida. Este texto requiere completar los datos indicados y revisión jurídica antes del lanzamiento. No autoriza cobros ni sustituye un contrato definitivo.",
      sections: [
        [
          "1. Quién prestará el servicio",
          "El futuro servicio será operado por [NOMBRE LEGAL DE LA EMPRESA], constituida en [ESTADO Y PAÍS], con dirección postal [DIRECCIÓN COMERCIAL] y contacto [CORREO DE SOPORTE]. Skendal es la marca del producto; el dominio o la marca no sustituyen la identidad de la parte contratante. La fecha de vigencia y la versión definitiva se indicarán antes de publicar estos términos.",
        ],
        [
          "2. Edad y cuentas",
          "El acceso se reserva a personas de 13 años o más. Crear o administrar un hogar y contratar una suscripción exige tener al menos 18 años y capacidad legal para contratar. Las personas de 13 a 17 años necesitan autorización y supervisión de su padre, madre o tutor y una invitación de un adulto del hogar. No se permite el acceso de menores de 13 años, tampoco mediante una tablet compartida. El rol «Hijo/a» no modifica esta edad mínima. Facilita información exacta y protege tus credenciales, passkeys, PIN y dispositivos vinculados.",
        ],
        [
          "3. Cómo se comparte un hogar",
          "Las tareas, listas, calendario, notas y fotos compartidas pueden ser vistas por las personas autorizadas del hogar. Las finanzas tienen controles adicionales para adultos. Los miembros que reciban acceso pueden consultar o modificar información según sus permisos. Invita únicamente a personas de confianza y revoca dispositivos cuando dejen de estar bajo tu control. Una tablet compartida da acceso mediante PIN, no una cuenta privada independiente para cada visitante.",
        ],
        [
          "4. Contenido que subes",
          "Conservas los derechos que tengas sobre tus textos y fotografías. Solo puedes subir material que hayas creado o que tengas autorización suficiente para usar, y debes respetar la privacidad y los derechos de imagen de otras personas. Nombrar al autor o encontrar una foto en internet no otorga permiso por sí solo. Al subir contenido, concedes al operador una licencia no exclusiva, limitada a alojarlo, reproducirlo técnicamente, redimensionarlo y mostrarlo a los usuarios autorizados para prestar el servicio. Esta licencia no permite usar tus fotos en publicidad ni entrenar modelos de inteligencia artificial con ellas. Termina cuando el contenido se elimina, salvo el tiempo técnico necesario, obligaciones legales o copias que otras personas conserven legítimamente.",
        ],
        [
          "5. Usos prohibidos y reclamaciones",
          "No subas contenido ilícito, material de explotación sexual infantil, amenazas, acoso, imágenes íntimas sin consentimiento o material que vulnere derechos de terceros. No intentes acceder a otros hogares, eludir permisos, suplantar identidades o interferir con el servicio. Podremos investigar avisos específicos y restringir contenido o cuentas cuando exista una razón documentada, de forma proporcionada y conforme a la ley. La política de copyright explicará cómo notificar errores y presentar una contranotificación cuando corresponda. Se aplicará una política frente a infractores reincidentes, sin asumir que toda denuncia demuestra una infracción.",
        ],
        [
          "6. Gratis y Pro",
          "La propuesta comercial contempla un plan Gratis y un plan Pro por hogar, compartido por sus miembros. Ambos incluyen las funciones básicas y los controles de seguridad. Las capacidades y los precios vigentes deberán aparecer antes de contratar. La propuesta inicial de límites es: Gratis, 4 miembros, 3 listas, 1 tablet, 3 fotos y 6 widgets; Pro, 12 miembros, 20 listas, 3 tablets, 12 fotos y todo el catálogo disponible de widgets. Son límites de preparación, todavía no aplicados a los hogares actuales. No se ofrece capacidad ilimitada de almacenamiento.",
        ],
        [
          "7. Pagos y renovación: propuesta para revisión",
          "Los cobros reales todavía están desactivados. Cuando se habiliten, Stripe alojará el formulario de pago. Antes de confirmar verás importe, moneda, periodicidad, impuestos aplicables y condiciones de renovación. La propuesta es renovación automática mensual o anual hasta cancelar. El comprador deberá aceptar expresamente esas condiciones, con registro de versión e importe; no se considerará un pago confirmado por volver a una página de éxito. Los cambios de precio afectarán a nuevas contrataciones salvo un proceso válido de aviso y aceptación para las suscripciones existentes. Los avisos de renovación o cambios que exija la ley deberán estar operativos antes de vender.",
        ],
        [
          "8. Cancelación, cambios y devoluciones: propuesta",
          "La propuesta es permitir la cancelación en línea desde Mi plan y el portal de Stripe, con efecto al final del período ya abonado. Cancelar no debe exigir una llamada ni borrar el hogar. Los cambios de periodicidad mostrarán el ajuste de importe que corresponda antes de confirmarlos. Propuesta pendiente de revisión: reembolso de la primera compra solicitado dentro de siete días, sin reembolso automático de renovaciones o períodos no usados, sin perjuicio de los derechos obligatorios. La política definitiva, su canal y sus excepciones deben aprobarse antes de activar cargos. Un reembolso y una cancelación son operaciones diferentes.",
        ],
        [
          "9. Si vence Pro o se supera un límite",
          "La propuesta es conservar la lectura, exportación y eliminación de la información existente, y limitar nuevas incorporaciones que superen la capacidad del plan. No se borrarán automáticamente fotos, listas ni historial por bajar a Gratis. Los estados de impago y los períodos de gracia se explicarán en la versión comercial antes de activarlos. Las pruebas de sandbox no otorgan una suscripción pagada real.",
        ],
        [
          "10. Privacidad, salida y eliminación",
          "La política de privacidad describirá datos, proveedores, conservación y solicitudes. Salir de un hogar revoca el acceso a ese hogar, pero no equivale a eliminar la cuenta ni todo el contenido compartido. Podrás solicitar eliminación de cuenta y acceso a tus datos mediante el canal de privacidad operativo. Parte del historial compartido podrá permanecer para los demás miembros cuando exista fundamento y sea compatible con sus derechos, reduciendo identificadores cuando proceda. Conviene guardar lo necesario antes de abandonar un hogar.",
        ],
        [
          "11. Disponibilidad y responsabilidad",
          "El servicio organiza información del hogar; no es un sistema de emergencias, custodia, asesoramiento financiero ni garantía de que otra persona realizará una tarea. La conexión, el dispositivo y los proveedores pueden afectar a su disponibilidad. El texto definitivo deberá fijar garantías y límites de responsabilidad adecuados al estado del operador y al consumidor. Ninguna cláusula excluirá responsabilidades o derechos que legalmente no puedan excluirse. No se propone arbitraje obligatorio ni renuncia colectiva sin una decisión y revisión separadas.",
        ],
        [
          "12. Derechos del servicio y cambios",
          "El operador conservará los derechos que legalmente le correspondan sobre el software, el diseño y las marcas, respetando las licencias de terceros. No se afirma que la marca esté registrada ni que todos los elementos generados con IA tengan copyright exclusivo. Los cambios materiales de términos se comunicarán con una fecha y versión; no se aplicarán retrospectivamente para ampliar el uso de contenido privado. El estado aplicable, el procedimiento de reclamación y el contacto final se completarán tras constituir la empresa, preservando las normas obligatorias de protección del consumidor.",
        ],
      ],
    },
    en: {
      title: "Skendal Terms of Service",
      notice:
        "NON-BINDING DRAFT. The operating company has not yet been formed. Complete the identified fields and obtain legal review before launch. This draft does not authorize charges or constitute final service terms.",
      sections: [
        [
          "1. The future operator",
          "The service will be operated by [LEGAL COMPANY NAME], formed in [STATE AND COUNTRY], with mailing address [BUSINESS ADDRESS] and contact [SUPPORT EMAIL]. Skendal is the product brand; a brand or domain does not identify the contracting legal entity. The final effective date and version must be specified before publication.",
        ],
        [
          "2. Age and accounts",
          "Access is limited to people aged 13 or older. Creating or administering a household and purchasing a subscription require age 18 or older and legal capacity to contract. People aged 13–17 need permission and supervision from a parent or legal guardian and an invitation from a household adult. Children under 13 may not use the service, including through a shared tablet. A Child profile label does not change the minimum age. Provide accurate information and protect your account credentials, passkeys, PINs and linked devices.",
        ],
        [
          "3. Sharing a household",
          "Shared tasks, lists, calendar entries, notes and photos can be viewed by authorized household members. Finances have additional adult-access controls. Members can view or change information according to their permissions. Invite people you trust and revoke devices that are no longer under your control. A shared tablet uses PIN access; it is not a separate private account for every visitor.",
        ],
        [
          "4. Your content",
          "You retain the rights you have in your text and photos. Upload only material you created or have sufficient permission to use, and respect other people's privacy and image rights. Crediting a creator or finding a photo online does not by itself provide permission. You grant the operator a nonexclusive license limited to hosting, technical reproduction, resizing and display to authorized users to provide the service. This license does not permit advertising use or AI-model training with your photos. It ends when content is deleted, subject to necessary technical processing, legal obligations and copies other people legitimately retain.",
        ],
        [
          "5. Prohibited use and complaints",
          "Do not upload unlawful material, child sexual abuse material, threats, harassment, nonconsensual intimate images or content violating others' rights. Do not access other households, bypass permissions, impersonate people or disrupt the service. Specific reports may be investigated and proportionate restrictions applied for documented reasons consistent with law. The copyright policy explains mistakes and applicable counter-notices. A repeat-infringer policy will apply, without assuming every complaint proves infringement.",
        ],
        [
          "6. Free and Pro",
          "The proposed offering has Free and Pro plans per household, shared by its members. Basic functions and security controls are included in both. Capacities and current prices must appear before purchase. Initial proposed limits are: Free, 4 members, 3 lists, 1 tablet, 3 photos and 6 widgets; Pro, 12 members, 20 lists, 3 tablets, 12 photos and the full available widget catalogue. These are preparation-stage limits, not restrictions currently imposed on existing households. Unlimited storage is not promised.",
        ],
        [
          "7. Payments and renewal: proposal for review",
          "Real charges are currently disabled. When enabled, Stripe will host payment collection. Before confirmation, the amount, currency, interval, applicable taxes and renewal terms must be displayed. The proposal is automatic monthly or annual renewal until cancellation. The buyer must expressly accept the terms with version and price evidence; a success-page redirect is not payment confirmation. Price edits apply to new purchases unless a valid notice and acceptance process is used for existing subscriptions. Legally required renewal and change notices must be operational before sales begin.",
        ],
        [
          "8. Cancellation, changes and refunds: proposal",
          "The proposal allows online cancellation through My plan and the Stripe portal, effective at the end of the paid period. Cancellation must not require a phone call or delete the household. Interval changes will show any applicable adjustment before confirmation. Pending review, the proposed first-purchase refund window is seven days; renewals and unused periods do not receive automatic refunds, subject to mandatory rights. The final policy, contact and exceptions must be approved before charges are enabled. A refund and a cancellation are separate operations.",
        ],
        [
          "9. Pro expiry and capacity limits",
          "The proposal preserves reading, export and removal of existing information, while restricting new additions that exceed the plan. Photos, lists and history will not automatically be deleted after a downgrade. Payment-failure states and grace periods must be explained before commercial activation. Sandbox tests never create a real paid entitlement.",
        ],
        [
          "10. Privacy, leaving and deletion",
          "The privacy notice will describe information, providers, retention and requests. Leaving a household ends access but does not delete the account or all shared content. Account deletion and data access can be requested through the operative privacy contact. Some shared history may remain available to others where justified and consistent with their rights, with identifiers reduced where appropriate. Save what you need before leaving a household.",
        ],
        [
          "11. Availability and liability",
          "Skendal organizes household information; it is not an emergency, supervision or financial-advice system, or a guarantee that another person will complete a task. Connectivity, devices and providers can affect availability. Final warranties and liability provisions require review under the operator's and consumers' applicable law. Nothing excludes liability or rights that cannot lawfully be excluded. Mandatory arbitration or a class waiver is not proposed without a separate decision and review.",
        ],
        [
          "12. Service rights and updates",
          "The operator retains rights it lawfully has in the software, design and branding, subject to third-party licenses. Registered trademark status or exclusive copyright in every AI-generated element is not claimed. Material term changes will have a communicated effective date and version; they will not retroactively broaden private-content use. Governing state, dispute process and final contact will be completed after formation, preserving mandatory consumer protections.",
        ],
      ],
    },
  },
  privacy: {
    es: {
      title: "Aviso de privacidad de Skendal",
      notice:
        "BORRADOR NO VIGENTE. Falta identificar a la empresa responsable, sus contactos y los plazos operativos finales. Describe la arquitectura observada y las medidas que deben verificarse antes de lanzar.",
      sections: [
        [
          "1. Responsable y alcance",
          "Responsable previsto: [NOMBRE LEGAL], [DIRECCIÓN], [ESTADO], contacto de privacidad [CORREO]. Este aviso cubrirá skendal.com y app.skendal.com. La web está en inglés y español; la aplicación funciona actualmente en español. La empresa todavía no se ha constituido y no se ofrecen cobros reales.",
        ],
        [
          "2. Información de cuenta y seguridad",
          "Se tratan correo, identificadores de cuenta, datos de autenticación y actividad necesaria para seguridad. Las passkeys utilizan credenciales criptográficas; Skendal no recibe la huella o el rostro que el sistema operativo use para desbloquearlas. Los PIN y tokens de dispositivos permiten el acceso al hogar con los controles del servidor. No debes compartir contraseñas, PIN o enlaces temporales con personas ajenas al hogar.",
        ],
        [
          "3. Información compartida",
          "La aplicación guarda nombres de perfiles, roles, tareas, productos y listas, eventos, recordatorios, notas, facturas, repartos, aportes y sus fechas, preferencias, fotos de perfil y fotos del hogar. Parte de esta información es compartida y puede revelar hábitos o datos personales. Quien introduce datos de otras personas debe estar autorizado y reducir los datos sensibles que no sean necesarios.",
        ],
        [
          "4. Fotografías y permisos",
          "Las imágenes se almacenan en contenedores privados con permisos de acceso. Las fotos del hogar y los avatares pueden verse por miembros autorizados; no se publican como una galería abierta. El operador y sus proveedores pueden procesar contenido cuando sea necesario para prestar el servicio, atender un incidente, una solicitud o una obligación legal. No se promete cifrado de extremo a extremo. Una foto original puede incluir metadatos: evita subir información que no quieras compartir. No se usan tus fotos para anuncios ni para entrenar modelos de IA.",
        ],
        [
          "5. Conexión, clima y proveedores",
          "Cloudflare procesa conexiones y datos técnicos para entregar y proteger el servicio. Supabase presta base de datos, autenticación y almacenamiento; el proyecto actual está en la región estadounidense us-east-1. Resend entrega correos de confirmación, recuperación e invitación. El clima usa una ubicación aproximada derivada de la conexión, sin pedir GPS, y un proveedor meteorológico; no se envían al proveedor nombres ni contenido del hogar para obtener el clima. Las redes de distribución y los proveedores pueden procesar información en Estados Unidos y otros lugares según sus contratos y operaciones.",
        ],
        [
          "6. Pagos",
          "En las pruebas se utiliza el sandbox de Stripe, sin crear ingresos o permisos pagados reales. Cuando se habiliten pagos, Stripe recibirá directamente los datos introducidos en su formulario alojado. Skendal no guarda números completos de tarjeta ni códigos de seguridad. Se conservarán los identificadores y estados necesarios de cliente, suscripción, factura y pago, y sus importes y moneda. Los controles de facturación del negocio están separados de las finanzas familiares.",
        ],
        [
          "7. Uso y comunicaciones",
          "La información se utiliza para operar cuentas, compartir el hogar, sincronizar listas, mostrar fotos y agenda, gestionar seguridad, atender solicitudes y, cuando corresponda, administrar la suscripción. Los correos funcionales no equivalen a una suscripción a publicidad. No se instalan actualmente rastreadores de anuncios en esta web ni se venden los datos del hogar. Cualquier incorporación futura de marketing deberá tener los controles y avisos que correspondan.",
        ],
        [
          "8. Navegador y dispositivos",
          "Se guardan elementos necesarios de sesión, el token de una tablet vinculada, preferencias y datos de listas sin conexión en el navegador. El kit de marketing guarda sus borradores localmente. Algunas copias o imágenes descargadas pueden permanecer en un dispositivo; retirar acceso no recupera copias que otra persona ya haya guardado. Puedes controlar o borrar datos del navegador, pero hacerlo con cambios de compras pendientes puede impedir su sincronización.",
        ],
        [
          "9. Con quién se comparte",
          "Se comparte con usuarios autorizados del hogar, proveedores necesarios y personas que gestionan el servicio bajo acceso limitado. También puede comunicarse lo requerido por ley, para gestionar una reclamación o para proteger derechos y seguridad. Si presentas una contranotificación de copyright, parte de la información de contacto y del escrito puede remitirse al reclamante para el procedimiento legal; se te informará de ese uso. No se entrega a otros hogares por el solo hecho de usar Skendal.",
        ],
        [
          "10. Menores",
          "No se permite usar Skendal a menores de 13 años. Las personas de 13–17 años requieren permiso y supervisión de su padre, madre o tutor, y los administradores del hogar deben tener al menos 18 años. Un adulto puede aportar fotos familiares de menores cuando tenga los derechos y permisos necesarios; esto no permite que un menor de 13 use el servicio. Si se detecta un acceso de ese tipo, deberá restringirse y gestionarse la eliminación correspondiente. El canal para avisarlo será [CORREO DE PRIVACIDAD].",
        ],
        [
          "11. Conservación y eliminación",
          "Se conservarán datos mientras sean necesarios para la cuenta y el servicio, para el historial compartido que otros miembros mantengan legítimamente y para obligaciones aplicables, incidencias o reclamaciones. Los plazos concretos de solicitudes, logs, copias de seguridad y conservación fiscal deben quedar definidos operativamente antes de publicar el aviso definitivo. Salir del hogar no elimina por sí solo la cuenta. Una solicitud de eliminación se verificará, se ejecutará sobre los datos que procedan y explicará las excepciones y los datos compartidos que deban conservarse.",
        ],
        [
          "12. Solicitudes y derechos",
          "Puedes solicitar acceso, corrección, eliminación y, cuando corresponda, una copia portable mediante [CORREO DE PRIVACIDAD] y el canal habilitado en la cuenta. Verificaremos la identidad de forma proporcionada, sin pedir datos excesivos. Los derechos y plazos legales varían según el lugar de residencia y la aplicabilidad de cada norma; no se afirma que toda ley estatal se aplique automáticamente a este negocio. No se discriminará por ejercer derechos. Antes del lanzamiento deben probarse la recepción, el seguimiento y la respuesta a las solicitudes.",
        ],
        [
          "13. Seguridad y cambios",
          "Se emplean controles de acceso, separación entre hogares y medidas de seguridad de los proveedores; no existe una garantía de seguridad absoluta. Los cambios materiales de este aviso tendrán fecha y versión, y se comunicarán cuando corresponda. Las preguntas se atenderán en el contacto de privacidad que se publique al completar la identidad del operador.",
        ],
      ],
    },
    en: {
      title: "Skendal Privacy Notice",
      notice:
        "NON-BINDING DRAFT. The operating company, operative contacts and final retention procedures remain to be completed. This describes the observed architecture and measures to verify before launch.",
      sections: [
        [
          "1. Operator and scope",
          "Proposed controller: [LEGAL NAME], [ADDRESS], [STATE], privacy contact [EMAIL]. This notice will cover skendal.com and app.skendal.com. The website is English/Spanish; the app currently works in Spanish. The company is not yet formed and real charges are not offered.",
        ],
        [
          "2. Account and security information",
          "Email, account identifiers, authentication data and necessary security activity are processed. Passkeys use cryptographic credentials; Skendal does not receive the fingerprint or face your operating system may use to unlock them. PINs and device tokens support server-controlled household access. Do not share credentials or temporary links outside the household.",
        ],
        [
          "3. Shared information",
          "The app stores profile names and roles, tasks, products and lists, events, reminders, notes, bills, allocations, dated contributions, preferences, profile photos and household photos. Shared information can reveal personal details or habits. People entering others' information must be authorized and should minimize unnecessary sensitive details.",
        ],
        [
          "4. Photos and permissions",
          "Images use private storage and access permissions. Authorized members can see household photos and avatars; they are not an open public gallery. The operator and providers may process content as necessary to deliver the service, investigate an incident, handle a request or satisfy law. End-to-end encryption is not promised. Original photos may contain metadata; avoid uploading information you do not want to share. Photos are not used for advertising or AI-model training.",
        ],
        [
          "5. Connections, weather and providers",
          "Cloudflare processes connections and technical information for delivery and security. Supabase supplies database, authentication and storage; the current project is in the US us-east-1 region. Resend delivers confirmation, recovery and invitation emails. Weather uses approximate connection-derived location without requesting GPS; household names and content are not sent to the weather provider. Distribution networks and providers may process data in the US and other locations under their contracts and operations.",
        ],
        [
          "6. Payments",
          "Tests use Stripe sandbox without real revenue or paid entitlements. When payments are enabled, Stripe receives payment information directly through its hosted form. Skendal does not store full card numbers or security codes. Necessary customer, subscription, invoice and payment identifiers, status, amounts and currency are retained. Business billing is separate from household finances.",
        ],
        [
          "7. Purposes and communications",
          "Information is used to operate accounts, share household records, synchronize lists, display photos and agenda, maintain security, answer requests and administer a subscription when applicable. Transactional emails do not subscribe a person to advertising. This website currently has no advertising trackers and household data is not sold. Future marketing additions would need appropriate controls and notices.",
        ],
        [
          "8. Browsers and devices",
          "Necessary session information, a linked-tablet token, preferences and offline shopping data are stored in the browser. The marketing kit stores its drafts locally. Copies or downloaded images may remain on devices; revoking access cannot recover copies already saved by others. Browser storage can be cleared, but clearing pending shopping changes may prevent synchronization.",
        ],
        [
          "9. Recipients",
          "Information is shared with authorized household users, necessary providers and people administering the service under limited access. Disclosures may also be needed by law, for a complaint or to protect rights and security. Copyright counter-notice contact details and statements may be forwarded to a claimant as part of the legal procedure, with appropriate notice. Using Skendal does not itself disclose a household's data to other households.",
        ],
        [
          "10. Young people",
          "Children under 13 may not use Skendal. People aged 13–17 require parental or guardian permission and supervision; household administrators must be at least 18. Adults may provide family photos involving children when they have the necessary rights and permissions; this does not permit under-13 service access. Identified under-13 use must be restricted and appropriate deletion handled. Reports will be accepted at [PRIVACY EMAIL].",
        ],
        [
          "11. Retention and deletion",
          "Data is retained as needed for accounts and service, shared history others legitimately maintain, applicable obligations, incidents and disputes. Specific request, log, backup and tax retention periods must be operationally defined before final publication. Leaving a household does not delete the account. A deletion request will be verified and applied to relevant information, explaining exceptions and shared records that need to remain.",
        ],
        [
          "12. Requests and rights",
          "Access, correction, deletion and applicable portability can be requested through [PRIVACY EMAIL] and the enabled account channel. Identity verification will be proportionate without excessive information. Legal rights and deadlines vary by residence and applicability; not every state privacy law automatically applies to this business. Exercising rights will not result in discrimination. Receipt, tracking and response procedures must be tested before launch.",
        ],
        [
          "13. Security and updates",
          "Access controls, household isolation and provider security measures are used, without a promise of absolute security. Material updates will carry a date and version and be communicated as required. Questions can be directed to the operative privacy contact after operator identity is completed.",
        ],
      ],
    },
  },
  copyright: {
    es: {
      title: "Política de imágenes y copyright de Skendal",
      notice:
        "BORRADOR NO VIGENTE. Deben completarse el operador y un contacto operativo. Publicar este texto no designa ni registra por sí solo un agente DMCA, ni garantiza las protecciones de la sección 512.",
      sections: [
        [
          "1. Derechos sobre las imágenes",
          "Cada persona conserva los derechos que tenga sobre el contenido que aporta. Solo se deben subir fotos propias, con licencia suficiente o con otra autorización legal válida. El permiso del fotógrafo y los derechos de privacidad o imagen de las personas retratadas son cuestiones distintas. Una foto familiar puede requerir ambos. No elimines avisos de autoría ni supongas que una imagen en redes sociales es de uso libre.",
        ],
        [
          "2. Uso por Skendal",
          "La licencia al servicio se limita a las operaciones necesarias de alojamiento, procesamiento técnico, redimensionado y visualización a miembros autorizados. No se autoriza publicidad con fotos del hogar ni entrenamiento de IA. Compartir en un hogar no transmite la propiedad de la foto a sus miembros ni les concede permiso para republicarla fuera del servicio.",
        ],
        [
          "3. Cómo comunicar una reclamación",
          "El futuro contacto será [NOMBRE DEL AGENTE O CONTACTO], [DIRECCIÓN POSTAL], [TELÉFONO], [CORREO DE COPYRIGHT]. Antes de presentarlo como agente designado para la sección 512, el operador debe completar la designación y el registro aplicables. Para avisos, identifica la obra protegida, el material o la actividad cuestionados y su ubicación con detalle suficiente. Si el enlace privado caduca, aporta el identificador de foto, hogar o captura que permita localizar el contenido, sin publicar fotos privadas innecesariamente.",
        ],
        [
          "4. Contenido de un aviso formal",
          "Incluye nombre y contacto del reclamante, identificación de la obra y del material, declaración de buena fe de que el uso no está autorizado por el titular, su agente o la ley, declaración de exactitud y de autoridad para actuar bajo pena de perjurio, y firma física o electrónica. No uses avisos para resolver discusiones personales o retirar contenido que tengas autorizado. Las reclamaciones falsas pueden tener consecuencias legales.",
        ],
        [
          "5. Revisión y retirada",
          "Se registrarán los avisos recibidos, se revisará su suficiencia y se podrá retirar o restringir material cuando corresponda, informando al usuario afectado. La revisión se limitará al contenido y la información necesarios para la reclamación; no se propone supervisar indiscriminadamente todas las fotos familiares. Podrá conservarse evidencia limitada para tramitar el caso y cumplir obligaciones.",
        ],
        [
          "6. Contranotificaciones",
          "Si crees que hubo un error o una identificación equivocada, podrás enviar una contranotificación cuando el procedimiento aplicable lo permita. Debe incluir firma, identificación y ubicación previa del material, declaración bajo pena de perjurio de tu creencia de buena fe en el error, nombre, dirección y teléfono, consentimiento a la jurisdicción del tribunal federal que corresponda y aceptación de notificaciones procesales de la parte reclamante. Tu escrito y datos necesarios se compartirán con esa parte. La versión final y los formularios deben concretarse con asesoría jurídica.",
        ],
        [
          "7. Plazos y reincidencia",
          "Cuando sea aplicable el procedimiento de la sección 512 y se reciba una contranotificación válida, el régimen contempla restauración no antes de diez ni después de catorce días hábiles, salvo comunicación de la acción judicial pertinente. No se promete restauración automática fuera de ese supuesto. Se mantendrá una política documentada frente a infractores reincidentes, con decisiones proporcionadas y la posibilidad de corregir errores.",
        ],
        [
          "8. Marca y materiales del producto",
          "Skendal debe revisar la disponibilidad y protección de su marca por separado del copyright. Tener un dominio no acredita derechos de marca. El símbolo inicial se creó con asistencia de IA; la protección por copyright depende de la autoría humana protegible y no se presume exclusividad sobre todo resultado generado. La fuente Manrope se usa bajo su licencia OFL. El registro de marca, la eventual designación DMCA y la constitución de la empresa son trámites separados, todavía pendientes.",
        ],
      ],
    },
    en: {
      title: "Skendal Image and Copyright Policy",
      notice:
        "NON-BINDING DRAFT. The operator and an operative contact must be completed. Publishing this text alone neither designates nor registers a DMCA agent, and does not guarantee section 512 protections.",
      sections: [
        [
          "1. Image rights",
          "People retain rights they have in uploaded content. Upload your own photos, appropriately licensed content or material with another valid legal authorization. A photographer's permission and a depicted person's privacy or image rights are distinct; a family photo may involve both. Do not remove attribution notices or assume social-media images are free to use.",
        ],
        [
          "2. Service use",
          "The service license is limited to necessary hosting, technical processing, resizing and display to authorized members. Household photos are not licensed for advertising or AI training. Sharing inside a household does not transfer photo ownership or authorize members to republish it elsewhere.",
        ],
        [
          "3. Reporting a claim",
          "The future contact will be [AGENT OR CONTACT NAME], [MAILING ADDRESS], [PHONE], [COPYRIGHT EMAIL]. The operator must complete applicable designation and registration before representing this as a section 512 designated agent. Identify the protected work, challenged material or activity, and enough location detail to find it. For expiring private links, provide a photo or household identifier or appropriate evidence without unnecessarily publishing private photos.",
        ],
        [
          "4. Formal notices",
          "Provide claimant name and contact details, identification of the work and material, a good-faith statement that the use is not authorized by the rightsholder, its agent or law, an accuracy and authority statement under penalty of perjury, and a physical or electronic signature. Do not use notices for personal disputes or authorized content. False claims can have legal consequences.",
        ],
        [
          "5. Review and restriction",
          "Reports will be recorded and reviewed for sufficiency. Material may be removed or restricted where appropriate and the affected user informed. Review should be limited to information needed for the complaint, not indiscriminate monitoring of family photos. Limited evidence may be kept to handle the case and legal obligations.",
        ],
        [
          "6. Counter-notices",
          "Where the applicable procedure permits, a mistaken removal or misidentification may be challenged. A counter-notice requires a signature, identification and former location of the material, a good-faith mistake statement under penalty of perjury, name, address and phone number, consent to the appropriate federal court's jurisdiction, and acceptance of service from the claimant. Necessary details and the statement will be shared with that party. Final procedures and forms require legal review.",
        ],
        [
          "7. Timing and repeat infringement",
          "When section 512 applies and a valid counter-notice is received, the statutory procedure contemplates restoration not earlier than ten nor later than fourteen business days, unless the relevant court action is reported. Automatic restoration outside that procedure is not promised. A documented repeat-infringer policy should use proportionate decisions and allow correction of mistakes.",
        ],
        [
          "8. Product branding and materials",
          "Trademark availability and protection must be reviewed separately from copyright. Domain ownership does not establish trademark rights. The initial symbol was created with AI assistance; copyright protection depends on protectable human authorship and does not imply exclusivity in every generated element. Manrope is used under its OFL license. Company formation, any DMCA designation and trademark registration are separate pending steps.",
        ],
      ],
    },
  },
};
