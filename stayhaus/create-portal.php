<?php
/**
 * StayHaus - Create Client Portal in Notion
 * Hostinger-friendly single-file endpoint. Receives JSON POST from onboarding.html,
 * creates the full Notion portal, returns { ok, url }.
 *
 * Setup on Hostinger:
 *   1. Upload this file + onboarding.html to public_html/
 *   2. Set env vars in hPanel (Advanced -> PHP Configuration -> Env vars), or hardcode below:
 *        NOTION_TOKEN     = secret_xxx
 *        PARENT_PAGE_ID   = xxxxxxxxxxxx
 *   3. Form posts to /create-portal.php
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'POST only']);
    exit;
}

$NOTION_TOKEN   = getenv('NOTION_TOKEN')   ?: '';
$PARENT_PAGE_ID = getenv('PARENT_PAGE_ID') ?: '';

if (!$NOTION_TOKEN || !$PARENT_PAGE_ID) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Server not configured (NOTION_TOKEN / PARENT_PAGE_ID)']);
    exit;
}

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!$data || !is_array($data)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
    exit;
}

// ---- Notion helpers ----
function notion($method, $url, $body = null) {
    global $NOTION_TOKEN;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => [
            "Authorization: Bearer $NOTION_TOKEN",
            "Notion-Version: 2022-06-28",
            "Content-Type: application/json",
        ],
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
    }
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code >= 300) {
        throw new Exception("Notion $method $url -> $code: " . substr($res, 0, 400));
    }
    return json_decode($res, true);
}

function rt($txt) { return [['type' => 'text', 'text' => ['content' => (string)$txt]]]; }

function slugify($s) {
    $s = mb_strtolower($s, 'UTF-8');
    // Cyrillic transliteration (Bulgarian-friendly)
    $tr = ['а'=>'a','б'=>'b','в'=>'v','г'=>'g','д'=>'d','е'=>'e','ж'=>'zh','з'=>'z',
           'и'=>'i','й'=>'y','к'=>'k','л'=>'l','м'=>'m','н'=>'n','о'=>'o','п'=>'p',
           'р'=>'r','с'=>'s','т'=>'t','у'=>'u','ф'=>'f','х'=>'h','ц'=>'ts','ч'=>'ch',
           'ш'=>'sh','щ'=>'sht','ъ'=>'a','ь'=>'','ю'=>'yu','я'=>'ya'];
    $s = strtr($s, $tr);
    $s = preg_replace('/[^a-z0-9]+/', '-', $s);
    return trim($s, '-');
}

function update_brands_json($data, $page) {
    $path = __DIR__ . '/brands.json';
    $entry = [
        'slug'       => slugify($data['brand_name'] ?? 'unnamed'),
        'name'       => $data['brand_name'] ?? '',
        'website'    => $data['website'] ?? '',
        'languages'  => array_map('trim', explode(',', $data['languages'] ?? '')),
        'notion_url' => $page['url'],
        'profile' => [
            'description'        => $data['brand_description'] ?? '',
            'customer_insights'  => $data['customer_insights'] ?? '',
            'desired_outcome'    => $data['desired_outcome'] ?? '',
            'why_us'             => $data['why_us'] ?? '',
            'differentiation'    => $data['differentiation'] ?? '',
            'usp'                => $data['usp'] ?? '',
            'hard_to_copy'       => $data['hard_to_copy'] ?? '',
            'one_sentence'       => $data['one_sentence'] ?? '',
        ],
        'guidelines' => [
            'raw'    => $data['brand_guidelines'] ?? '',
            'colors' => ['primary' => '', 'accent' => '', 'bg' => '#FFFFFF'],
            'fonts'  => ['heading' => '', 'body' => ''],
            'tone'   => '',
        ],
        'drive_link' => $data['drive_link'] ?? '',
        'approver'   => [
            'name'  => $data['approver_name'] ?? '',
            'email' => $data['approver_email'] ?? '',
        ],
        'updated_at' => date('c'),
    ];

    $fp = fopen($path, 'c+');
    if (!$fp) return;
    if (!flock($fp, LOCK_EX)) { fclose($fp); return; }

    $raw = stream_get_contents($fp);
    $doc = $raw ? json_decode($raw, true) : null;
    if (!$doc || !isset($doc['brands'])) {
        $doc = ['version' => 1, 'updated_at' => date('c'), 'brands' => []];
    }

    // Upsert by slug
    $found = false;
    foreach ($doc['brands'] as $i => $b) {
        if (($b['slug'] ?? '') === $entry['slug']) {
            $doc['brands'][$i] = $entry;
            $found = true;
            break;
        }
    }
    if (!$found) $doc['brands'][] = $entry;
    $doc['updated_at'] = date('c');

    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($doc, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

function create_page($parent_id, $title, $icon = null) {
    $payload = [
        'parent'     => ['type' => 'page_id', 'page_id' => $parent_id],
        'properties' => ['title' => [['text' => ['content' => $title]]]],
    ];
    if ($icon) $payload['icon'] = $icon;
    return notion('POST', 'https://api.notion.com/v1/pages', $payload);
}

function create_database($parent_id, $title, $properties) {
    return notion('POST', 'https://api.notion.com/v1/databases', [
        'parent'     => ['type' => 'page_id', 'page_id' => $parent_id],
        'title'      => [['text' => ['content' => $title]]],
        'properties' => $properties,
    ]);
}

function append_blocks($block_id, $children) {
    return notion('PATCH', "https://api.notion.com/v1/blocks/$block_id/children", ['children' => $children]);
}

// ---- Build portal ----
try {
    $brand = $data['brand_name'] ?? 'Нов Клиент';

    // 1. Main page
    $page = create_page($PARENT_PAGE_ID, "Клиентски портал $brand", ['type' => 'emoji', 'emoji' => '🏠']);
    $page_id = $page['id'];

    // 2. Child pages
    $menu = [];
    foreach (['Ресурси','Месечни Отчети','Всички Срещи','Достъп','FAQs / Често Задавани Въпроси'] as $t) {
        $p = create_page($page_id, $t);
        $menu[$t] = $p['id'];
    }

    // Store Klaviyo API key securely in the Достъп page (not in brands.json)
    $klaviyo_key = $data['klaviyo_api_key'] ?? '';
    if ($klaviyo_key && isset($menu['Достъп'])) {
        $masked = substr($klaviyo_key, 0, 6) . str_repeat('•', max(0, strlen($klaviyo_key) - 10)) . substr($klaviyo_key, -4);
        append_blocks($menu['Достъп'], [
            ['object'=>'block','type'=>'heading_2','heading_2'=>['rich_text'=>rt('🔑 Klaviyo достъп')]],
            ['object'=>'block','type'=>'paragraph','paragraph'=>['rich_text'=>rt("API ключ: $klaviyo_key")]],
            ['object'=>'block','type'=>'callout','callout'=>[
                'rich_text' => rt('Този ключ се използва от автоматизацията за достъп до Klaviyo акаунта на клиента. Не го споделяйте публично.'),
                'icon'      => ['type'=>'emoji','emoji'=>'⚠️'],
            ]],
        ]);
    }

    // 3. Project DB
    $project_db = create_database($page_id, 'Client Project', [
        'Име'    => ['title' => (object)[]],
        'Статус' => ['select' => ['options' => [
            ['name' => 'Планиране', 'color' => 'gray'],
            ['name' => 'Дизайн',    'color' => 'blue'],
            ['name' => 'Копи',      'color' => 'purple'],
            ['name' => 'Билд',      'color' => 'orange'],
            ['name' => 'Live',      'color' => 'green'],
        ]]],
        'Тип'   => ['select' => ['options' => [
            ['name' => 'Welcome Flow',       'color' => 'blue'],
            ['name' => 'Abandoned Cart',     'color' => 'red'],
            ['name' => 'Post-Purchase',      'color' => 'green'],
            ['name' => 'Winback',            'color' => 'orange'],
            ['name' => 'Browse Abandonment', 'color' => 'purple'],
            ['name' => 'Campaign',           'color' => 'pink'],
        ]]],
        'Дата'  => ['date' => (object)[]],
    ]);
    $project_db_id = $project_db['id'];

    // 4. Email calendar DB
    $email_db = create_database($page_id, 'Имейл Календар', [
        'Име на имейл'      => ['title' => (object)[]],
        'Дата на изпращане' => ['date'  => (object)[]],
        'Статус' => ['select' => ['options' => [
            ['name' => 'Чернова',     'color' => 'gray'],
            ['name' => 'За одобрение','color' => 'yellow'],
            ['name' => 'Одобрен',     'color' => 'blue'],
            ['name' => 'Изпратен',    'color' => 'green'],
        ]]],
        'Език' => ['multi_select' => ['options' => [
            ['name' => 'BG', 'color' => 'green'],
            ['name' => 'RO', 'color' => 'blue'],
            ['name' => 'GR', 'color' => 'purple'],
            ['name' => 'HU', 'color' => 'orange'],
        ]]],
        'Flow' => ['select' => ['options' => [
            ['name' => 'Welcome',        'color' => 'blue'],
            ['name' => 'Abandoned Cart', 'color' => 'red'],
            ['name' => 'Post-Purchase',  'color' => 'green'],
            ['name' => 'Winback',        'color' => 'orange'],
            ['name' => 'Campaign',       'color' => 'pink'],
        ]]],
    ]);
    $email_db_id = $email_db['id'];

    // 5. Welcome callout
    append_blocks($page_id, [
        ['object'=>'block','type'=>'callout','callout'=>[
            'rich_text' => rt("Здравейте, добре дошли в клиентския портал на $brand!"),
            'icon'      => ['type'=>'emoji','emoji'=>'👋'],
        ]],
        ['object'=>'block','type'=>'divider','divider'=>(object)[]],
    ]);

    // 6. Brand info section
    $kv = function($label, $key, $fallback = '') use ($data) {
        return [
            ['object'=>'block','type'=>'heading_3','heading_3'=>['rich_text'=>rt($label)]],
            ['object'=>'block','type'=>'paragraph','paragraph'=>['rich_text'=>rt($data[$key] ?? $fallback)]],
        ];
    };

    $brand_blocks = array_merge(
        [['object'=>'block','type'=>'heading_2','heading_2'=>['rich_text'=>rt('📝 Информация за бранда')]]],
        $kv('Описание на бранда', 'brand_description'),
        $kv('Какво искат клиентите', 'customer_insights'),
        $kv('Желан резултат', 'desired_outcome'),
        $kv('Защо нас', 'why_us'),
        $kv('Диференциация', 'differentiation'),
        [['object'=>'block','type'=>'divider','divider'=>(object)[]]],
        [['object'=>'block','type'=>'heading_2','heading_2'=>['rich_text'=>rt('📊 USP и предимства')]]],
        $kv('УТП', 'usp'),
        $kv('Трудно копируеми предимства', 'hard_to_copy', 'Не е предоставено'),
        $kv('Едно изречение, защо да изберат вас', 'one_sentence'),
        [['object'=>'block','type'=>'divider','divider'=>(object)[]]],
        [['object'=>'block','type'=>'heading_2','heading_2'=>['rich_text'=>rt('🔗 Достъп и асети')]]],
        [
            ['object'=>'block','type'=>'paragraph','paragraph'=>['rich_text'=>rt('Уебсайт: '.($data['website'] ?? ''))]],
            ['object'=>'block','type'=>'paragraph','paragraph'=>['rich_text'=>rt('Google Drive: '.($data['drive_link'] ?? ''))]],
            ['object'=>'block','type'=>'paragraph','paragraph'=>['rich_text'=>rt('Брандбук: '.($data['brand_guidelines'] ?? 'Не е предоставен'))]],
            ['object'=>'block','type'=>'paragraph','paragraph'=>['rich_text'=>rt('Продуктови категории: '.($data['product_categories'] ?? ''))]],
            ['object'=>'block','type'=>'paragraph','paragraph'=>['rich_text'=>rt('Езици: '.($data['languages'] ?? ''))]],
            ['object'=>'block','type'=>'paragraph','paragraph'=>['rich_text'=>rt('Одобряващ: '.($data['approver_name'] ?? '').' ('.($data['approver_email'] ?? '').')')]],
        ],
    );
    append_blocks($page_id, $brand_blocks);

    update_brands_json($data, $page);

    // Notify Alex
    $notify = getenv('NOTIFY_EMAIL') ?: '';
    if ($notify) {
        $subject = "Нов клиент: $brand";
        $body  = "Нов онбординг получен.\n\n";
        $body .= "Бранд: $brand\n";
        $body .= "Уебсайт: " . ($data['website'] ?? '-') . "\n";
        $body .= "Одобряващ: " . ($data['approver_name'] ?? '-') . " (" . ($data['approver_email'] ?? '-') . ")\n";
        $body .= "Езици: " . ($data['languages'] ?? '-') . "\n\n";
        $body .= "Notion портал: " . $page['url'] . "\n";
        @mail($notify, $subject, $body, "From: noreply@stayhaus.eu\r\nContent-Type: text/plain; charset=utf-8\r\n");
    }

    echo json_encode(['ok' => true, 'url' => $page['url']]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
