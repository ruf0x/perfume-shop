type Text = { fr: string; ar: string }

export interface TourStep {
  /** Where the step takes the visitor. */
  path: string
  /** Needs the owner to be signed in (the guide signs in for them). */
  admin?: boolean
  /** An element to make blink once the page is there. */
  focus?: string
  title: Text
  text: Text
  /** What to try, one line each. */
  tips: { fr: string[]; ar: string[] }
}

/** Shown on the last step: how to reach you. Leave empty to show nothing. */
export const DEMO_CONTACT = ''

export const TOUR: TourStep[] = [
  {
    path: '/',
    title: { fr: 'Bienvenue dans la démo', ar: 'مرحبًا بكم في النسخة التجريبية' },
    text: {
      fr: "Vous voyez la boutique en ligne telle que vos clients la verront, puis l'espace de gestion. Toutes les données sont fictives : essayez tout, rien n'est envoyé ni enregistré ailleurs que dans votre navigateur.",
      ar: 'ترون المتجر الإلكتروني كما سيراه زبائنكم، ثم لوحة الإدارة. كل البيانات وهمية: جرّبوا كل شيء، لا يُرسَل أي شيء ولا يُحفَظ إلا في متصفحكم.',
    },
    tips: {
      fr: ['Le site s’adapte au téléphone : réduisez la fenêtre pour voir.', 'Ce guide vous suit : « Suivant » vous emmène à la bonne page.'],
      ar: ['الموقع يتأقلم مع الهاتف: صغّروا النافذة لتروا ذلك.', 'هذا الدليل يرافقكم: «التالي» ينقلكم إلى الصفحة المناسبة.'],
    },
  },
  {
    path: '/boutique',
    title: { fr: 'Un catalogue clair', ar: 'كتالوج واضح' },
    text: {
      fr: 'Parfums, cosmétiques, montres, lunettes : chaque rayon a ses familles et ses filtres. Le client cherche, filtre par marque, par genre, par prix.',
      ar: 'عطور، مستحضرات تجميل، ساعات، نظارات: لكل قسم عائلاته ومرشّحاته. يبحث الزبون ويصفّي حسب العلامة والجنس والسعر.',
    },
    tips: {
      fr: ['Changez de rayon avec les onglets en haut.', 'Essayez la recherche et le tri par prix.'],
      ar: ['غيّروا القسم بالتبويبات في الأعلى.', 'جرّبوا البحث والترتيب حسب السعر.'],
    },
  },
  {
    path: '/boutique?rayon=parfums',
    title: { fr: 'Un parfum, plusieurs tailles', ar: 'عطر واحد بعدة أحجام' },
    text: {
      fr: 'Chaque parfum se vend en décant (10, 20, 30 ml) ou en flacon complet, chacune avec son prix. Le client ne voit jamais votre stock : il commande, vous confirmez selon ce que vous avez.',
      ar: 'يُباع كل عطر بالتقسيم (10، 20، 30 مل) أو بالقارورة الكاملة، ولكل حجم سعره. لا يرى الزبون مخزونكم أبدًا: يطلب هو وتؤكدون أنتم حسب المتوفر.',
    },
    tips: {
      fr: ['Ouvrez un parfum, choisissez une taille, ajoutez au panier.'],
      ar: ['افتحوا عطرًا، اختاروا حجمًا، وأضيفوه إلى السلة.'],
    },
  },
  {
    path: '/panier',
    title: { fr: 'Commander en quelques secondes', ar: 'طلب في ثوانٍ' },
    text: {
      fr: 'Paiement à la livraison : le client indique son nom, son téléphone et sa wilaya. Les frais de livraison se calculent seuls selon la wilaya et le mode (domicile ou point relais).',
      ar: 'الدفع عند الاستلام: يكتب الزبون اسمه ورقم هاتفه وولايته. تُحسب تكلفة التوصيل تلقائيًا حسب الولاية والطريقة (إلى المنزل أو نقطة استلام).',
    },
    tips: {
      fr: ['Passez la commande avec un faux numéro (05 50 00 00 00).', 'Retrouvez-la ensuite dans l’administration, étape « Commandes ».'],
      ar: ['أنجزوا طلبًا برقم وهمي (05 50 00 00 00).', 'ستجدونه لاحقًا في الإدارة، خطوة «الطلبات».'],
    },
  },
  {
    path: '/admin/login',
    title: { fr: "L'espace de gestion", ar: 'فضاء التسيير' },
    text: {
      fr: 'Le propriétaire voit tout. L’employé n’a accès qu’aux commandes, produits, stock et caisse : ni les bénéfices, ni les prix d’achat.',
      ar: 'يرى المالك كل شيء. أما الموظف فله فقط الطلبات والمنتجات والمخزون والصندوق: لا الأرباح ولا أسعار الشراء.',
    },
    tips: {
      fr: ['Cliquez « Entrer comme propriétaire » (aucun mot de passe en démo).'],
      ar: ['اضغطوا «الدخول كمالك» (بدون كلمة سر في النسخة التجريبية).'],
    },
  },
  {
    path: '/admin',
    admin: true,
    title: { fr: 'Le tableau de bord', ar: 'لوحة التحكم' },
    text: {
      fr: 'Le chiffre d’affaires du jour, de la semaine, du mois ou de l’année, la part en ligne et en boutique, et surtout le bénéfice en dinars et en pourcentage, calculé à partir de vos prix d’achat.',
      ar: 'رقم أعمال اليوم أو الأسبوع أو الشهر أو السنة، حصة المبيعات عبر الإنترنت وفي المحل، والأهم الربح بالدينار وبالنسبة المئوية محسوبًا من أسعار الشراء.',
    },
    tips: {
      fr: ['Changez la période en haut.', 'Faites défiler « Meilleures ventes » : le bénéfice est indiqué par produit.'],
      ar: ['غيّروا الفترة في الأعلى.', 'مرّروا قائمة «الأكثر مبيعًا»: الربح مذكور لكل منتج.'],
    },
  },
  {
    path: '/admin/commandes',
    admin: true,
    focus: 'a[href$="/admin/commandes"]',
    title: { fr: 'Les commandes', ar: 'الطلبات' },
    text: {
      fr: 'Chaque commande arrive « En attente ». Vous voyez tout de suite si le stock permet de la confirmer, vous appelez le client, puis vous confirmez, expédiez et livrez. Le stock se met à jour tout seul.',
      ar: 'يصل كل طلب بحالة «في الانتظار». ترون فورًا إن كان المخزون يسمح بتأكيده، تتصلون بالزبون ثم تؤكدون وتشحنون وتسلّمون. ويتحدّث المخزون تلقائيًا.',
    },
    tips: {
      fr: ['Ouvrez la commande que vous venez de passer et confirmez-la.', 'Cherchez « Layton » : il manque du stock, la commande attend l’arrivage.'],
      ar: ['افتحوا الطلب الذي أنجزتموه للتو وأكّدوه.', 'ابحثوا عن «Layton»: المخزون ناقص، والطلب ينتظر وصول البضاعة.'],
    },
  },
  {
    path: '/admin/produits',
    admin: true,
    title: { fr: 'Produits et prix d’achat', ar: 'المنتجات وأسعار الشراء' },
    text: {
      fr: 'Pour chaque taille, entrez le prix d’achat : le prix de vente se déduit d’un pourcentage de bénéfice, ou l’inverse. Ajoutez des photos, des notes olfactives, des packs.',
      ar: 'أدخلوا سعر الشراء لكل حجم: يُستنتج سعر البيع من نسبة ربح، أو العكس. أضيفوا الصور والنوتات العطرية والباقات.',
    },
    tips: {
      fr: ['Ouvrez un parfum et changez le « Bénéfice voulu » : tous les prix suivent.'],
      ar: ['افتحوا عطرًا وغيّروا «الربح المطلوب»: تتبعه كل الأسعار.'],
    },
  },
  {
    path: '/admin/caisse',
    admin: true,
    title: { fr: 'La caisse du magasin', ar: 'صندوق المحل' },
    text: {
      fr: 'Pour les ventes au comptoir : cherchez le produit, choisissez la taille, appliquez une remise, encaissez et imprimez le ticket. Le stock diminue immédiatement.',
      ar: 'لمبيعات المحل: ابحثوا عن المنتج، اختاروا الحجم، طبّقوا تخفيضًا، واقبضوا واطبعوا الوصل. ينقص المخزون فورًا.',
    },
    tips: {
      fr: ['Ajoutez deux produits, saisissez un téléphone et validez.'],
      ar: ['أضيفوا منتجين، اكتبوا رقم هاتف وأكّدوا.'],
    },
  },
  {
    path: '/admin/clients',
    admin: true,
    title: { fr: 'Clients et fidélité', ar: 'الزبائن والوفاء' },
    text: {
      fr: 'Chaque client est suivi par son téléphone. Au bout de 6 parfums achetés, le suivant est offert : l’application propose des cadeaux de valeur proche de la moyenne de ses achats.',
      ar: 'يُتابَع كل زبون برقم هاتفه. بعد شراء 6 عطور يكون العطر التالي هدية: يقترح التطبيق هدايا بقيمة قريبة من متوسط مشترياته.',
    },
    tips: {
      fr: ['Cherchez « Karim Haddad » : un cadeau l’attend, cliquez « Offrir ».', 'Cherchez « Sofiane Merabet » : il en a déjà reçu un.', 'Cherchez « Amina Bensalem » : elle est à 5 sur 6.', 'Le programme s’active ou se coupe dans Paramètres, onglet « Fidélité ».'],
      ar: ['ابحثوا عن «Karim Haddad»: هدية بانتظاره، اضغطوا «تسليم الهدية».', 'ابحثوا عن «Sofiane Merabet»: تلقّى هدية سابقًا.', 'ابحثوا عن «Amina Bensalem»: هي عند 5 من 6.', 'يُفعَّل البرنامج أو يُعطَّل من الإعدادات، قسم «الوفاء».'],
    },
  },
  {
    path: '/admin/stock',
    admin: true,
    title: { fr: 'Le stock, au millilitre près', ar: 'المخزون بالمليلتر' },
    text: {
      fr: 'Les parfums se décantent : vous suivez les millilitres restants et les flacons scellés. Ouvrez un flacon pour le décanter, déclarez une perte, ajoutez un arrivage.',
      ar: 'تُقسَّم العطور: تتابعون المليلترات المتبقية والقوارير المغلقة. افتحوا قارورة لتقسيمها، سجّلوا خسارة، أضيفوا وصول بضاعة.',
    },
    tips: {
      fr: ['Filtrez sur « Stock bas » pour voir ce qu’il faut racheter.'],
      ar: ['صفّوا حسب «مخزون منخفض» لمعرفة ما يجب إعادة شراؤه.'],
    },
  },
  {
    path: '/admin/bouteilles',
    admin: true,
    title: { fr: 'Les bouteilles vides', ar: 'القوارير الفارغة' },
    text: {
      fr: 'Chaque décant consomme une bouteille de sa taille. Vous suivez ce que vous avez acheté, investi, ce qu’il reste, et vous êtes prévenu quand il faut en racheter.',
      ar: 'كل تقسيم يستهلك قارورة من حجمه. تتابعون ما اشتريتموه وما استثمرتموه وما تبقّى، ويُنبَّه إليكم عند الحاجة لإعادة الشراء.',
    },
    tips: {
      fr: ['Ajoutez un achat de bouteilles : l’investissement se met à jour.'],
      ar: ['أضيفوا عملية شراء قوارير: يتحدّث الاستثمار.'],
    },
  },
  {
    path: '/admin',
    admin: true,
    title: { fr: 'En arabe ou en français', ar: 'بالعربية أو بالفرنسية' },
    text: {
      fr: 'L’administration existe en arabe (de droite à gauche) et en français. Chacun choisit sa langue dans le menu, et le choix est retenu sur son appareil.',
      ar: 'الإدارة متوفرة بالعربية (من اليمين إلى اليسار) وبالفرنسية. يختار كل شخص لغته من القائمة ويُحفَظ اختياره على جهازه.',
    },
    tips: {
      fr: ['Cliquez sur « العربية » ou « Français » en bas du menu.'],
      ar: ['اضغطوا على «العربية» أو «Français» أسفل القائمة.'],
    },
  },
  {
    path: '/admin',
    admin: true,
    title: { fr: 'À vous de jouer', ar: 'جاء دوركم' },
    text: {
      fr: 'Vous avez fait le tour. Cette boutique peut porter vos couleurs, votre logo, vos produits et vos tarifs de livraison.',
      ar: 'أنهيتم الجولة. يمكن لهذا المتجر أن يحمل ألوانكم وشعاركم ومنتجاتكم وتعريفات التوصيل الخاصة بكم.',
    },
    tips: { fr: [], ar: [] },
  },
]
