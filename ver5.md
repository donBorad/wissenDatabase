You're right, I ignored your explicit instruction. I'm sorry. Here are all four files written directly in chat.

---

## `api.php`

```php
<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

define('DB_PATH', __DIR__ . '/data/tracker.db');
define('UPLOAD_DIR', __DIR__ . '/uploads/');
define('MAX_FILE_SIZE', 20 * 1024 * 1024);
define('ALLOWED_EXT', ['jpg','jpeg','png','gif','pdf','txt','log','csv','docx','xlsx']);
define('ALLOWED_MIME', [
    'image/jpeg','image/png','image/gif','application/pdf',
    'text/plain','text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
]);

function getDB(): PDO {
    if (!is_dir(dirname(DB_PATH))) mkdir(dirname(DB_PATH), 0755, true);
    $db = new PDO('sqlite:' . DB_PATH);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->exec('PRAGMA journal_mode=WAL;');
    $db->exec('PRAGMA foreign_keys=ON;');
    initDB($db);
    return $db;
}

function initDB(PDO $db): void {
    $db->exec("
    CREATE TABLE IF NOT EXISTS issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT UNIQUE,
        title TEXT NOT NULL,
        description TEXT,
        resolution TEXT,
        root_cause TEXT,
        resolution_type TEXT DEFAULT 'Unknown',
        category TEXT DEFAULT 'Other',
        tags TEXT,
        asset TEXT,
        reporter TEXT,
        assigned_to TEXT,
        team TEXT,
        owner TEXT,
        status TEXT DEFAULT 'New',
        priority TEXT DEFAULT 'Medium',
        channel TEXT DEFAULT 'Email',
        time_spent REAL DEFAULT 0,
        due_date TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        related_event INTEGER,
        deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject TEXT NOT NULL,
        event_type TEXT DEFAULT 'Meeting',
        location TEXT DEFAULT 'Teams',
        attendees TEXT,
        event_date TEXT,
        duration INTEGER,
        priority TEXT DEFAULT 'Medium',
        category TEXT,
        description TEXT,
        outcome TEXT,
        action_items TEXT,
        followup_date TEXT,
        reporter TEXT,
        tags TEXT,
        related_issues TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS scripts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        command TEXT NOT NULL,
        description TEXT,
        os TEXT DEFAULT 'Windows',
        category TEXT,
        tags TEXT,
        risk_level TEXT DEFAULT 'Safe',
        notes TEXT,
        example_output TEXT,
        pinned INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS knowledge_base (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        symptoms TEXT,
        cause TEXT,
        fix TEXT,
        commands_used TEXT,
        tags TEXT,
        related_issues_count INTEGER DEFAULT 0,
        last_tested TEXT,
        source_issue_id INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_type TEXT,
        parent_id INTEGER,
        filename TEXT,
        original_name TEXT,
        mime_type TEXT,
        file_size INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_type TEXT,
        parent_id INTEGER,
        action TEXT,
        detail TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS issues_fts USING fts5(
        title, description, resolution, tags, reporter, assigned_to, category,
        content=issues, content_rowid=id
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
        subject, description, outcome, tags, reporter,
        content=events, content_rowid=id
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS scripts_fts USING fts5(
        title, command, description, tags, notes,
        content=scripts, content_rowid=id
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(
        title, symptoms, cause, fix, tags,
        content=knowledge_base, content_rowid=id
    );

    CREATE TRIGGER IF NOT EXISTS issues_ai AFTER INSERT ON issues BEGIN
        INSERT INTO issues_fts(rowid,title,description,resolution,tags,reporter,assigned_to,category)
        VALUES(new.id,new.title,new.description,new.resolution,new.tags,new.reporter,new.assigned_to,new.category);
    END;
    CREATE TRIGGER IF NOT EXISTS issues_au AFTER UPDATE ON issues BEGIN
        INSERT INTO issues_fts(issues_fts,rowid,title,description,resolution,tags,reporter,assigned_to,category)
        VALUES('delete',old.id,old.title,old.description,old.resolution,old.tags,old.reporter,old.assigned_to,old.category);
        INSERT INTO issues_fts(rowid,title,description,resolution,tags,reporter,assigned_to,category)
        VALUES(new.id,new.title,new.description,new.resolution,new.tags,new.reporter,new.assigned_to,new.category);
    END;
    CREATE TRIGGER IF NOT EXISTS events_ai AFTER INSERT ON events BEGIN
        INSERT INTO events_fts(rowid,subject,description,outcome,tags,reporter)
        VALUES(new.id,new.subject,new.description,new.outcome,new.tags,new.reporter);
    END;
    CREATE TRIGGER IF NOT EXISTS events_au AFTER UPDATE ON events BEGIN
        INSERT INTO events_fts(events_fts,rowid,subject,description,outcome,tags,reporter)
        VALUES('delete',old.id,old.subject,old.description,old.outcome,old.tags,old.reporter);
        INSERT INTO events_fts(rowid,subject,description,outcome,tags,reporter)
        VALUES(new.id,new.subject,new.description,new.outcome,new.tags,new.reporter);
    END;
    CREATE TRIGGER IF NOT EXISTS scripts_ai AFTER INSERT ON scripts BEGIN
        INSERT INTO scripts_fts(rowid,title,command,description,tags,notes)
        VALUES(new.id,new.title,new.command,new.description,new.tags,new.notes);
    END;
    CREATE TRIGGER IF NOT EXISTS scripts_au AFTER UPDATE ON scripts BEGIN
        INSERT INTO scripts_fts(scripts_fts,rowid,title,command,description,tags,notes)
        VALUES('delete',old.id,old.title,old.command,old.description,old.tags,old.notes);
        INSERT INTO scripts_fts(rowid,title,command,description,tags,notes)
        VALUES(new.id,new.title,new.command,new.description,new.tags,new.notes);
    END;
    CREATE TRIGGER IF NOT EXISTS kb_ai AFTER INSERT ON knowledge_base BEGIN
        INSERT INTO kb_fts(rowid,title,symptoms,cause,fix,tags)
        VALUES(new.id,new.title,new.symptoms,new.cause,new.fix,new.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS kb_au AFTER UPDATE ON knowledge_base BEGIN
        INSERT INTO kb_fts(kb_fts,rowid,title,symptoms,cause,fix,tags)
        VALUES('delete',old.id,old.title,old.symptoms,old.cause,old.fix,old.tags);
        INSERT INTO kb_fts(rowid,title,symptoms,cause,fix,tags)
        VALUES(new.id,new.title,new.symptoms,new.cause,new.fix,new.tags);
    END;
    ");
}

function generateTicketId(PDO $db): string {
    $date = date('Ymd');
    $stmt = $db->prepare("SELECT COUNT(*) FROM issues WHERE ticket_id LIKE ?");
    $stmt->execute(["ISS-{$date}-%"]);
    $count = (int)$stmt->fetchColumn() + 1;
    return sprintf("ISS-%s-%03d", $date, $count);
}

function logActivity(PDO $db, string $type, int $id, string $action, string $detail = ''): void {
    $stmt = $db->prepare("INSERT INTO activity_log (parent_type,parent_id,action,detail) VALUES(?,?,?,?)");
    $stmt->execute([$type, $id, $action, $detail]);
}

function getAttachments(PDO $db, string $type, int $id): array {
    $stmt = $db->prepare("SELECT * FROM attachments WHERE parent_type=? AND parent_id=? AND deleted_at IS NULL ORDER BY created_at DESC");
    $stmt->execute([$type, $id]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function getActivity(PDO $db, string $type, int $id): array {
    $stmt = $db->prepare("SELECT * FROM activity_log WHERE parent_type=? AND parent_id=? ORDER BY created_at DESC LIMIT 100");
    $stmt->execute([$type, $id]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function respond(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function err(string $msg, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['error' => $msg]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$type   = $_GET['type'] ?? '';
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;
$limit  = isset($_GET['limit']) ? min((int)$_GET['limit'], 200) : 50;
$offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;
$q      = trim($_GET['q'] ?? '');

try {
    $db = getDB();

    // FILE UPLOAD
    if ($type === 'upload' && $method === 'POST') {
        if (!is_dir(UPLOAD_DIR)) mkdir(UPLOAD_DIR, 0755, true);
        $parentType = $_POST['parent_type'] ?? '';
        $parentId   = (int)($_POST['parent_id'] ?? 0);
        if (!$parentType || !$parentId) err('Missing parent_type or parent_id');
        $results = [];
        foreach ($_FILES['files']['name'] ?? [] as $i => $origName) {
            if ($_FILES['files']['error'][$i] !== UPLOAD_ERR_OK) continue;
            if ($_FILES['files']['size'][$i] > MAX_FILE_SIZE) continue;
            $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
            if (!in_array($ext, ALLOWED_EXT)) continue;
            $mime = mime_content_type($_FILES['files']['tmp_name'][$i]);
            if (!in_array($mime, ALLOWED_MIME) && !str_starts_with($mime, 'text/')) continue;
            $safeName = uniqid('att_', true) . '.' . $ext;
            move_uploaded_file($_FILES['files']['tmp_name'][$i], UPLOAD_DIR . $safeName);
            $stmt = $db->prepare("INSERT INTO attachments (parent_type,parent_id,filename,original_name,mime_type,file_size) VALUES(?,?,?,?,?,?)");
            $stmt->execute([$parentType, $parentId, $safeName, $origName, $mime, $_FILES['files']['size'][$i]]);
            $attId = $db->lastInsertId();
            logActivity($db, $parentType, $parentId, 'attachment_added', $origName);
            $results[] = ['id' => $attId, 'filename' => $safeName, 'original_name' => $origName];
        }
        respond(['attachments' => $results]);
    }

    // DELETE ATTACHMENT
    if ($type === 'attachment' && $method === 'DELETE' && $id) {
        $db->prepare("UPDATE attachments SET deleted_at=datetime('now') WHERE id=?")->execute([$id]);
        respond(['ok' => true]);
    }

    // SERVE FILE
    if ($type === 'file' && $method === 'GET') {
        $filename = basename($_GET['name'] ?? '');
        $path = UPLOAD_DIR . $filename;
        $stmt = $db->prepare("SELECT * FROM attachments WHERE filename=? AND deleted_at IS NULL");
        $stmt->execute([$filename]);
        $att = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$att || !file_exists($path)) err('Not found', 404);
        header('Content-Type: ' . $att['mime_type']);
        header('Content-Disposition: attachment; filename="' . $att['original_name'] . '"');
        readfile($path);
        exit;
    }

    // ACTIVITY
    if ($type === 'activity' && $method === 'GET') {
        $ptype = $_GET['parent_type'] ?? '';
        $pid   = (int)($_GET['parent_id'] ?? 0);
        respond(['items' => getActivity($db, $ptype, $pid)]);
    }

    // DASHBOARD
    if ($type === 'dashboard' && $method === 'GET') {
        $open_count    = $db->query("SELECT COUNT(*) FROM issues WHERE deleted_at IS NULL AND status NOT IN ('Resolved','Closed')")->fetchColumn();
        $critical      = $db->query("SELECT COUNT(*) FROM issues WHERE deleted_at IS NULL AND priority='Critical' AND status NOT IN ('Resolved','Closed')")->fetchColumn();
        $overdue       = $db->query("SELECT COUNT(*) FROM issues WHERE deleted_at IS NULL AND due_date < datetime('now') AND status NOT IN ('Resolved','Closed')")->fetchColumn();
        $resolved_week = $db->query("SELECT COUNT(*) FROM issues WHERE deleted_at IS NULL AND status='Resolved' AND updated_at >= datetime('now','-7 days')")->fetchColumn();
        $total_time    = $db->query("SELECT COALESCE(SUM(time_spent),0) FROM issues WHERE deleted_at IS NULL")->fetchColumn();
        $pinned        = $db->query("SELECT * FROM scripts WHERE deleted_at IS NULL AND pinned=1 ORDER BY updated_at DESC LIMIT 5")->fetchAll(PDO::FETCH_ASSOC);
        $recent_kb     = $db->query("SELECT * FROM knowledge_base WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 5")->fetchAll(PDO::FETCH_ASSOC);
        $categories    = $db->query("SELECT category, COUNT(*) as cnt FROM issues WHERE deleted_at IS NULL GROUP BY category ORDER BY cnt DESC LIMIT 8")->fetchAll(PDO::FETCH_ASSOC);
        $recent_items  = $db->query("SELECT 'issue' as type, id, ticket_id as ref, title, status, updated_at FROM issues WHERE deleted_at IS NULL
            UNION ALL SELECT 'event', id, event_type, subject, '', updated_at FROM events WHERE deleted_at IS NULL
            ORDER BY updated_at DESC LIMIT 8")->fetchAll(PDO::FETCH_ASSOC);
        respond(compact('open_count','critical','overdue','resolved_week','total_time','pinned','recent_kb','categories','recent_items'));
    }

    // EXPORT
    if ($type === 'export' && $method === 'GET') {
        $tbl = $_GET['table'] ?? 'issues';
        $allowed = ['issues','events','scripts','knowledge_base'];
        if (!in_array($tbl, $allowed)) err('Invalid table');
        $rows = $db->query("SELECT * FROM {$tbl} WHERE deleted_at IS NULL")->fetchAll(PDO::FETCH_ASSOC);
        if (empty($rows)) { respond(['csv' => '']); }
        $out = implode(',', array_keys($rows[0])) . "\n";
        foreach ($rows as $r) {
            $out .= implode(',', array_map(fn($v) => '"' . str_replace('"','""',(string)$v) . '"', $r)) . "\n";
        }
        respond(['csv' => $out]);
    }

    // BACKUP
    if ($type === 'backup' && $method === 'GET') {
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="tracker_backup_' . date('Ymd_His') . '.db"');
        readfile(DB_PATH);
        exit;
    }

    // DUPLICATE CHECK
    if ($type === 'duplicate_check' && $method === 'GET') {
        $title = $_GET['title'] ?? '';
        if (!$title) respond(['duplicates' => []]);
        $stmt = $db->prepare("SELECT id,ticket_id,title,status FROM issues WHERE deleted_at IS NULL AND title LIKE ? LIMIT 5");
        $stmt->execute(['%' . $title . '%']);
        respond(['duplicates' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    // ===== ISSUES =====
    if ($type === 'issue') {
        if ($method === 'GET' && !$id) {
            $filter   = $_GET['filter'] ?? 'all';
            $category = $_GET['category'] ?? '';
            $priority = $_GET['priority'] ?? '';
            $where = ['i.deleted_at IS NULL'];
            $params = [];
            if ($filter === 'open')     $where[] = "i.status NOT IN ('Resolved','Closed')";
            if ($filter === 'resolved') $where[] = "i.status = 'Resolved'";
            if ($filter === 'closed')   $where[] = "i.status = 'Closed'";
            if ($filter === 'overdue')  $where[] = "i.due_date < datetime('now') AND i.status NOT IN ('Resolved','Closed')";
            if ($category) { $where[] = "i.category = ?"; $params[] = $category; }
            if ($priority) { $where[] = "i.priority = ?"; $params[] = $priority; }
            if ($q) { $where[] = "i.id IN (SELECT rowid FROM issues_fts WHERE issues_fts MATCH ?)"; $params[] = $q . '*'; }
            $sql = "SELECT i.* FROM issues i WHERE " . implode(' AND ', $where) . " ORDER BY i.created_at DESC LIMIT ? OFFSET ?";
            $params[] = $limit; $params[] = $offset;
            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($items as &$row) $row['attachments'] = getAttachments($db, 'issue', $row['id']);
            $countParams = array_slice($params, 0, -2);
            $countSql = "SELECT COUNT(*) FROM issues i WHERE " . implode(' AND ', $where);
            $stmt2 = $db->prepare($countSql);
            $stmt2->execute($countParams);
            respond(['items' => $items, 'total' => (int)$stmt2->fetchColumn()]);
        }
        if ($method === 'GET' && $id) {
            $stmt = $db->prepare("SELECT * FROM issues WHERE id=? AND deleted_at IS NULL");
            $stmt->execute([$id]);
            $item = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$item) err('Not found', 404);
            $item['attachments'] = getAttachments($db, 'issue', $id);
            $item['activity']    = getActivity($db, 'issue', $id);
            respond($item);
        }
        if ($method === 'POST') {
            $d = json_decode(file_get_contents('php://input'), true) ?? [];
            if (empty($d['title'])) err('Title required');
            $ticketId = generateTicketId($db);
            $created = $d['created_at'] ?? date('Y-m-d H:i:s');
            $stmt = $db->prepare("INSERT INTO issues
                (ticket_id,title,description,resolution,root_cause,resolution_type,category,tags,asset,
                 reporter,assigned_to,team,owner,status,priority,channel,time_spent,due_date,created_at,related_event)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
            $stmt->execute([
                $ticketId,$d['title'],$d['description']??'',$d['resolution']??'',$d['root_cause']??'',
                $d['resolution_type']??'Unknown',$d['category']??'Other',$d['tags']??'',$d['asset']??'',
                $d['reporter']??'',$d['assigned_to']??'',$d['team']??'',$d['owner']??'',
                $d['status']??'New',$d['priority']??'Medium',$d['channel']??'Email',
                $d['time_spent']??0,$d['due_date']??null,$created,$d['related_event']??null
            ]);
            $newId = (int)$db->lastInsertId();
            logActivity($db, 'issue', $newId, 'created', $ticketId);
            $stmt2 = $db->prepare("SELECT * FROM issues WHERE id=?"); $stmt2->execute([$newId]);
            respond($stmt2->fetch(PDO::FETCH_ASSOC), 201);
        }
        if ($method === 'PUT' && $id) {
            $d = json_decode(file_get_contents('php://input'), true) ?? [];
            $prev = $db->prepare("SELECT status FROM issues WHERE id=?"); $prev->execute([$id]);
            $old = $prev->fetch(PDO::FETCH_ASSOC);
            $stmt = $db->prepare("UPDATE issues SET
                title=?,description=?,resolution=?,root_cause=?,resolution_type=?,category=?,tags=?,asset=?,
                reporter=?,assigned_to=?,team=?,owner=?,status=?,priority=?,channel=?,time_spent=?,due_date=?,
                related_event=?,updated_at=datetime('now') WHERE id=? AND deleted_at IS NULL");
            $stmt->execute([
                $d['title']??'',$d['description']??'',$d['resolution']??'',$d['root_cause']??'',
                $d['resolution_type']??'Unknown',$d['category']??'Other',$d['tags']??'',$d['asset']??'',
                $d['reporter']??'',$d['assigned_to']??'',$d['team']??'',$d['owner']??'',
                $d['status']??'New',$d['priority']??'Medium',$d['channel']??'Email',
                $d['time_spent']??0,$d['due_date']??null,$d['related_event']??null,$id
            ]);
            logActivity($db,'issue',$id,'edited','');
            if ($old && $old['status'] !== ($d['status']??''))
                logActivity($db,'issue',$id,'status_changed',$old['status'].' → '.($d['status']??''));
            $stmt2 = $db->prepare("SELECT * FROM issues WHERE id=?"); $stmt2->execute([$id]);
            respond($stmt2->fetch(PDO::FETCH_ASSOC));
        }
        if ($method === 'DELETE' && $id) {
            $db->prepare("UPDATE issues SET deleted_at=datetime('now') WHERE id=?")->execute([$id]);
            logActivity($db,'issue',$id,'deleted','');
            respond(['ok' => true]);
        }
    }

    // ===== EVENTS =====
    if ($type === 'event') {
        if ($method === 'GET' && !$id) {
            $where = ['deleted_at IS NULL']; $params = [];
            if ($q) { $where[] = "id IN (SELECT rowid FROM events_fts WHERE events_fts MATCH ?)"; $params[] = $q.'*'; }
            $sql = "SELECT * FROM events WHERE ".implode(' AND ',$where)." ORDER BY event_date DESC, created_at DESC LIMIT ? OFFSET ?";
            $params[] = $limit; $params[] = $offset;
            $stmt = $db->prepare($sql); $stmt->execute($params);
            $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($items as &$row) $row['attachments'] = getAttachments($db,'event',$row['id']);
            respond(['items' => $items]);
        }
        if ($method === 'GET' && $id) {
            $stmt = $db->prepare("SELECT * FROM events WHERE id=? AND deleted_at IS NULL"); $stmt->execute([$id]);
            $item = $stmt->fetch(PDO::FETCH_ASSOC); if (!$item) err('Not found',404);
            $item['attachments'] = getAttachments($db,'event',$id);
            $item['activity']    = getActivity($db,'event',$id);
            respond($item);
        }
        if ($method === 'POST') {
            $d = json_decode(file_get_contents('php://input'),true) ?? [];
            if (empty($d['subject'])) err('Subject required');
            $stmt = $db->prepare("INSERT INTO events (subject,event_type,location,attendees,event_date,duration,priority,category,description,outcome,action_items,followup_date,reporter,tags,related_issues) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
            $stmt->execute([$d['subject'],$d['event_type']??'Meeting',$d['location']??'Teams',$d['attendees']??'',$d['event_date']??null,$d['duration']??null,$d['priority']??'Medium',$d['category']??'',$d['description']??'',$d['outcome']??'',$d['action_items']??'',$d['followup_date']??null,$d['reporter']??'',$d['tags']??'',$d['related_issues']??'']);
            $newId = (int)$db->lastInsertId();
            logActivity($db,'event',$newId,'created','');
            $stmt2 = $db->prepare("SELECT * FROM events WHERE id=?"); $stmt2->execute([$newId]);
            respond($stmt2->fetch(PDO::FETCH_ASSOC),201);
        }
        if ($method === 'PUT' && $id) {
            $d = json_decode(file_get_contents('php://input'),true) ?? [];
            $stmt = $db->prepare("UPDATE events SET subject=?,event_type=?,location=?,attendees=?,event_date=?,duration=?,priority=?,category=?,description=?,outcome=?,action_items=?,followup_date=?,reporter=?,tags=?,related_issues=?,updated_at=datetime('now') WHERE id=? AND deleted_at IS NULL");
            $stmt->execute([$d['subject'],$d['event_type']??'Meeting',$d['location']??'Teams',$d['attendees']??'',$d['event_date']??null,$d['duration']??null,$d['priority']??'Medium',$d['category']??'',$d['description']??'',$d['outcome']??'',$d['action_items']??'',$d['followup_date']??null,$d['reporter']??'',$d['tags']??'',$d['related_issues']??'',$id]);
            logActivity($db,'event',$id,'edited','');
            $stmt2 = $db->prepare("SELECT * FROM events WHERE id=?"); $stmt2->execute([$id]);
            respond($stmt2->fetch(PDO::FETCH_ASSOC));
        }
        if ($method === 'DELETE' && $id) {
            $db->prepare("UPDATE events SET deleted_at=datetime('now') WHERE id=?")->execute([$id]);
            respond(['ok'=>true]);
        }
    }

    // ===== SCRIPTS =====
    if ($type === 'script') {
        if ($method === 'GET' && !$id) {
            $where = ['deleted_at IS NULL']; $params = [];
            if (($_GET['pinned']??'') === '1') $where[] = "pinned=1";
            if ($q) { $where[] = "id IN (SELECT rowid FROM scripts_fts WHERE scripts_fts MATCH ?)"; $params[] = $q.'*'; }
            $sql = "SELECT * FROM scripts WHERE ".implode(' AND ',$where)." ORDER BY pinned DESC, updated_at DESC LIMIT ? OFFSET ?";
            $params[] = $limit; $params[] = $offset;
            $stmt = $db->prepare($sql); $stmt->execute($params);
            respond(['items' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
        }
        if ($method === 'POST') {
            $d = json_decode(file_get_contents('php://input'),true) ?? [];
            if (empty($d['title'])||empty($d['command'])) err('Title and command required');
            $stmt = $db->prepare("INSERT INTO scripts (title,command,description,os,category,tags,risk_level,notes,example_output,pinned) VALUES(?,?,?,?,?,?,?,?,?,?)");
            $stmt->execute([$d['title'],$d['command'],$d['description']??'',$d['os']??'Windows',$d['category']??'',$d['tags']??'',$d['risk_level']??'Safe',$d['notes']??'',$d['example_output']??'',$d['pinned']??0]);
            $newId = (int)$db->lastInsertId();
            $stmt2 = $db->prepare("SELECT * FROM scripts WHERE id=?"); $stmt2->execute([$newId]);
            respond($stmt2->fetch(PDO::FETCH_ASSOC),201);
        }
        if ($method === 'PUT' && $id) {
            $d = json_decode(file_get_contents('php://input'),true) ?? [];
            $stmt = $db->prepare("UPDATE scripts SET title=?,command=?,description=?,os=?,category=?,tags=?,risk_level=?,notes=?,example_output=?,pinned=?,updated_at=datetime('now') WHERE id=? AND deleted_at IS NULL");
            $stmt->execute([$d['title'],$d['command'],$d['description']??'',$d['os']??'Windows',$d['category']??'',$d['tags']??'',$d['risk_level']??'Safe',$d['notes']??'',$d['example_output']??'',$d['pinned']??0,$id]);
            $stmt2 = $db->prepare("SELECT * FROM scripts WHERE id=?"); $stmt2->execute([$id]);
            respond($stmt2->fetch(PDO::FETCH_ASSOC));
        }
        if ($method === 'DELETE' && $id) {
            $db->prepare("UPDATE scripts SET deleted_at=datetime('now') WHERE id=?")->execute([$id]);
            respond(['ok'=>true]);
        }
    }

    // ===== KNOWLEDGE BASE =====
    if ($type === 'kb') {
        if ($method === 'GET' && !$id) {
            $where = ['deleted_at IS NULL']; $params = [];
            if ($q) { $where[] = "id IN (SELECT rowid FROM kb_fts WHERE kb_fts MATCH ?)"; $params[] = $q.'*'; }
            $sql = "SELECT * FROM knowledge_base WHERE ".implode(' AND ',$where)." ORDER BY updated_at DESC LIMIT ? OFFSET ?";
            $params[] = $limit; $params[] = $offset;
            $stmt = $db->prepare($sql); $stmt->execute($params);
            $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($items as &$row) $row['attachments'] = getAttachments($db,'kb',$row['id']);
            respond(['items' => $items]);
        }
        if ($method === 'GET' && $id) {
            $stmt = $db->prepare("SELECT * FROM knowledge_base WHERE id=? AND deleted_at IS NULL"); $stmt->execute([$id]);
            $item = $stmt->fetch(PDO::FETCH_ASSOC); if (!$item) err('Not found',404);
            $item['attachments'] = getAttachments($db,'kb',$id);
            respond($item);
        }
        if ($method === 'POST') {
            $d = json_decode(file_get_contents('php://input'),true) ?? [];
            if (empty($d['title'])) err('Title required');
            $stmt = $db->prepare("INSERT INTO knowledge_base (title,symptoms,cause,fix,commands_used,tags,last_tested,source_issue_id) VALUES(?,?,?,?,?,?,?,?)");
            $stmt->execute([$d['title'],$d['symptoms']??'',$d['cause']??'',$d['fix']??'',$d['commands_used']??'',$d['tags']??'',$d['last_tested']??null,$d['source_issue_id']??null]);
            $newId = (int)$db->lastInsertId();
            if (!empty($d['source_issue_id'])) logActivity($db,'issue',(int)$d['source_issue_id'],'kb_created',$d['title']);
            $stmt2 = $db->prepare("SELECT * FROM knowledge_base WHERE id=?"); $stmt2->execute([$newId]);
            respond($stmt2->fetch(PDO::FETCH_ASSOC),201);
        }
        if ($method === 'PUT' && $id) {
            $d = json_decode(file_get_contents('php://input'),true) ?? [];
            $stmt = $db->prepare("UPDATE knowledge_base SET title=?,symptoms=?,cause=?,fix=?,commands_used=?,tags=?,last_tested=?,updated_at=datetime('now') WHERE id=? AND deleted_at IS NULL");
            $stmt->execute([$d['title'],$d['symptoms']??'',$d['cause']??'',$d['fix']??'',$d['commands_used']??'',$d['tags']??'',$d['last_tested']??null,$id]);
            $stmt2 = $db->prepare("SELECT * FROM knowledge_base WHERE id=?"); $stmt2->execute([$id]);
            respond($stmt2->fetch(PDO::FETCH_ASSOC));
        }
        if ($method === 'DELETE' && $id) {
            $db->prepare("UPDATE knowledge_base SET deleted_at=datetime('now') WHERE id=?")->execute([$id]);
            respond(['ok'=>true]);
        }
    }

    err('Unknown endpoint', 404);
} catch (Exception $e) {
    err($e->getMessage(), 500);
}
```

---

## `style.css`

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:      #0d0f14;
  --bg2:     #13161e;
  --bg3:     #1a1e28;
  --bg4:     #222736;
  --border:  #2a2f3f;
  --border2: #363c52;
  --text:    #c9cdd8;
  --text2:   #7f8699;
  --text3:   #4f5566;
  --accent:  #3b82f6;
  --accent2: #1d4ed8;
  --green:   #22c55e;
  --yellow:  #eab308;
  --red:     #ef4444;
  --orange:  #f97316;
  --purple:  #a855f7;
  --cyan:    #06b6d4;
  --font:    'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  --font2:   'Inter', 'Segoe UI', system-ui, sans-serif;
  --radius:  6px;
  --shadow:  0 4px 24px rgba(0,0,0,.45);
}

html { font-size: 14px; }
body {
  font-family: var(--font2);
  background: var(--bg);
  color: var(--text);
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--bg2); }
::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }

#topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  height: 48px;
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  z-index: 100;
}
#topbar .logo {
  font-family: var(--font);
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: .05em;
  white-space: nowrap;
  text-transform: uppercase;
}
#topbar .logo span { color: var(--text2); font-weight: 400; }

.search-wrap { position: relative; flex: 1; max-width: 420px; }
.search-wrap::before {
  content: '⌕';
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text3);
  font-size: 15px;
  pointer-events: none;
}
#search-global {
  width: 100%;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-family: var(--font2);
  font-size: 13px;
  padding: 6px 12px 6px 32px;
  outline: none;
  transition: border-color .15s;
}
#search-global:focus { border-color: var(--accent); }

#topbar .actions { display: flex; gap: 8px; margin-left: auto; align-items: center; }

#tabs {
  display: flex;
  gap: 2px;
  padding: 6px 16px 0;
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.tab {
  padding: 7px 16px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--text2);
  cursor: pointer;
  border-radius: 4px 4px 0 0;
  border: 1px solid transparent;
  border-bottom: none;
  transition: color .1s, background .1s;
  user-select: none;
}
.tab:hover { color: var(--text); background: var(--bg3); }
.tab.active {
  color: var(--accent);
  background: var(--bg);
  border-color: var(--border);
  border-bottom-color: var(--bg);
  margin-bottom: -1px;
}

#main { flex: 1; overflow: hidden; display: flex; }

.module { display: none; flex: 1; overflow: hidden; flex-direction: column; }
.module.active { display: flex; }

.mod-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.filter-group { display: flex; gap: 4px; }
.filter-btn {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .04em;
  border-radius: 3px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text2);
  cursor: pointer;
  transition: all .1s;
}
.filter-btn:hover { background: var(--bg3); color: var(--text); }
.filter-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }

.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  border-radius: var(--radius);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all .12s;
  white-space: nowrap;
  font-family: var(--font2);
  letter-spacing: .02em;
  background: none;
}
.btn-primary  { background: var(--accent); color: #fff; }
.btn-primary:hover { background: var(--accent2); }
.btn-ghost    { border-color: var(--border); color: var(--text2); }
.btn-ghost:hover { background: var(--bg3); color: var(--text); border-color: var(--border2); }
.btn-danger   { border-color: var(--red); color: var(--red); }
.btn-danger:hover { background: var(--red); color: #fff; }
.btn-success  { border-color: var(--green); color: var(--green); }
.btn-success:hover { background: var(--green); color: #000; }
.btn-sm  { padding: 3px 8px; font-size: 11px; }
.btn-xs  { padding: 2px 6px; font-size: 10px; }
.btn-icon { padding: 5px 7px; }

.list-area {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.card {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
  transition: border-color .1s;
  position: relative;
}
.card:hover { border-color: var(--border2); }
.card-header { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 6px; }
.card-title  { font-size: 13px; font-weight: 600; color: var(--text); flex: 1; line-height: 1.4; }
.card-meta   { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 6px; font-size: 11px; color: var(--text2); align-items: center; }
.card-body   { font-size: 12px; color: var(--text2); line-height: 1.6; display: none; }
.card.expanded .card-body { display: block; }
.card-actions { display: flex; gap: 5px; margin-top: 8px; flex-wrap: wrap; opacity: 0; transition: opacity .1s; }
.card:hover .card-actions { opacity: 1; }

.badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
.badge-status-new        { background: rgba(59,130,246,.2);  color: var(--accent); }
.badge-status-open       { background: rgba(6,182,212,.2);   color: var(--cyan); }
.badge-status-inprogress { background: rgba(168,85,247,.2);  color: var(--purple); }
.badge-status-waiting    { background: rgba(234,179,8,.2);   color: var(--yellow); }
.badge-status-resolved   { background: rgba(34,197,94,.2);   color: var(--green); }
.badge-status-closed     { background: rgba(79,85,102,.2);   color: var(--text3); }
.badge-status-reopened   { background: rgba(249,115,22,.2);  color: var(--orange); }
.badge-prio-low      { background: rgba(34,197,94,.15);  color: var(--green); }
.badge-prio-medium   { background: rgba(234,179,8,.15);  color: var(--yellow); }
.badge-prio-high     { background: rgba(249,115,22,.15); color: var(--orange); }
.badge-prio-critical { background: rgba(239,68,68,.2);   color: var(--red); }
.badge-risk-safe        { background: rgba(34,197,94,.15);  color: var(--green); }
.badge-risk-admin       { background: rgba(234,179,8,.15);  color: var(--yellow); }
.badge-risk-destructive { background: rgba(239,68,68,.2);   color: var(--red); }
.badge-cat { background: var(--bg3); color: var(--text2); border: 1px solid var(--border); }
.badge-os  { background: rgba(6,182,212,.1); color: var(--cyan); }
.tag { display: inline-block; padding: 1px 6px; background: var(--bg3); border: 1px solid var(--border); border-radius: 3px; font-size: 10px; color: var(--text3); }

.code-block {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 10px 12px;
  font-family: var(--font);
  font-size: 12px;
  color: #7dd3fc;
  overflow-x: auto;
  white-space: pre;
  line-height: 1.5;
  position: relative;
}
.copy-btn-code { position: absolute; top: 6px; right: 6px; opacity: 0; transition: opacity .1s; }
.code-block:hover .copy-btn-code { opacity: 1; }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}
.modal-overlay.hidden { display: none; }
.modal {
  background: var(--bg2);
  border: 1px solid var(--border2);
  border-radius: 8px;
  width: 720px;
  max-width: 96vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow);
}
.modal.modal-lg { width: 900px; }
.modal.modal-sm { width: 420px; }
.modal-header { display: flex; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--border); gap: 10px; flex-wrap: wrap; }
.modal-header h3 { font-size: 14px; font-weight: 700; color: var(--text); }
.modal-body   { flex: 1; overflow-y: auto; padding: 18px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--border); }

.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-grid .full { grid-column: 1/-1; }
.form-group { display: flex; flex-direction: column; gap: 4px; }
.form-group label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--text2); }
.form-group input,
.form-group textarea,
.form-group select {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-family: var(--font2);
  font-size: 13px;
  padding: 7px 10px;
  outline: none;
  transition: border-color .12s;
  width: 100%;
}
.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus { border-color: var(--accent); }
.form-group textarea { resize: vertical; min-height: 70px; }
.form-group select option { background: var(--bg3); }
.form-section { margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
.form-section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.form-section-title { font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--text3); margin-bottom: 10px; }

.template-bar { display: flex; gap: 5px; flex-wrap: wrap; }
.tpl-btn { padding: 3px 9px; font-size: 11px; border: 1px solid var(--border2); border-radius: 3px; background: transparent; color: var(--text2); cursor: pointer; transition: all .1s; }
.tpl-btn:hover { background: var(--bg3); color: var(--accent); border-color: var(--accent); }

.upload-zone {
  border: 2px dashed var(--border);
  border-radius: var(--radius);
  padding: 16px;
  text-align: center;
  color: var(--text3);
  font-size: 12px;
  cursor: pointer;
  transition: all .15s;
}
.upload-zone.drag-over { border-color: var(--accent); color: var(--accent); background: rgba(59,130,246,.05); }
.upload-previews { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.att-thumb { position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; width: 80px; }
.att-thumb img { width: 72px; height: 56px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border); }
.att-icon { width: 72px; height: 56px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg3); display: flex; align-items: center; justify-content: center; font-size: 20px; color: var(--text3); }
.att-name { font-size: 10px; color: var(--text2); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 72px; }
.att-remove { position: absolute; top: -5px; right: -5px; width: 16px; height: 16px; background: var(--red); color: #fff; border-radius: 50%; border: none; cursor: pointer; font-size: 10px; display: flex; align-items: center; justify-content: center; }

.timeline { display: flex; flex-direction: column; }
.timeline-item { display: flex; gap: 10px; padding: 6px 0; border-left: 2px solid var(--border); margin-left: 6px; padding-left: 14px; position: relative; font-size: 12px; color: var(--text2); }
.timeline-item::before { content: ''; position: absolute; left: -5px; top: 10px; width: 8px; height: 8px; border-radius: 50%; background: var(--border2); border: 2px solid var(--bg2); }
.timeline-item .tl-action { color: var(--text); font-weight: 600; }
.timeline-item .tl-time { color: var(--text3); font-size: 11px; margin-left: auto; white-space: nowrap; }

#dashboard-module .list-area { padding: 16px; }
.dashboard-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.widget { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; cursor: grab; transition: border-color .1s; }
.widget:hover { border-color: var(--border2); }
.widget.dragging { opacity: .4; cursor: grabbing; }
.widget.drag-over { border-color: var(--accent); }
.widget-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--text3); margin-bottom: 8px; }
.widget-value { font-family: var(--font); font-size: 28px; font-weight: 700; color: var(--text); line-height: 1; margin-bottom: 4px; }
.widget-value.red    { color: var(--red); }
.widget-value.orange { color: var(--orange); }
.widget-value.green  { color: var(--green); }
.widget-value.accent { color: var(--accent); }
.widget-sub  { font-size: 11px; color: var(--text3); }
.widget-list { list-style: none; display: flex; flex-direction: column; gap: 5px; }
.widget-list li { font-size: 12px; color: var(--text2); padding: 4px 0; border-bottom: 1px solid var(--border); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.widget-list li:last-child { border-bottom: none; }
.widget-full { grid-column: 1/-1; }
.cat-row   { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
.cat-label { font-size: 11px; color: var(--text2); width: 80px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cat-track { flex: 1; height: 4px; background: var(--bg3); border-radius: 2px; }
.cat-fill  { height: 100%; border-radius: 2px; background: var(--accent); }
.cat-count { font-size: 11px; color: var(--text3); width: 24px; text-align: right; }

.dup-warning { background: rgba(234,179,8,.1); border: 1px solid rgba(234,179,8,.3); border-radius: 4px; padding: 6px 10px; font-size: 11px; color: var(--yellow); display: none; margin-bottom: 10px; }
.dup-warning.visible { display: block; }

.quick-strip { background: var(--bg2); border-bottom: 1px solid var(--border); padding: 8px 16px; display: none; gap: 8px; flex-wrap: wrap; align-items: flex-end; }
.quick-strip.open { display: flex; }
.quick-strip .form-group { flex: 1; min-width: 120px; }
.quick-strip .form-group label { font-size: 10px; }
.quick-strip .form-group input,
.quick-strip .form-group select { padding: 5px 8px; font-size: 12px; }

.detail-section { margin-bottom: 14px; }
.detail-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--text3); margin-bottom: 4px; }
.detail-val   { font-size: 13px; color: var(--text); line-height: 1.6; white-space: pre-wrap; }

.load-more-wrap { text-align: center; padding: 12px 0; }

#toast-container { position: fixed; bottom: 20px; right: 20px; display: flex; flex-direction: column; gap: 8px; z-index: 9999; }
.toast { padding: 10px 16px; border-radius: var(--radius); font-size: 12px; font-weight: 600; background: var(--bg3); border: 1px solid var(--border2); color: var(--text); box-shadow: var(--shadow); animation: slideIn .2s ease; max-width: 320px; }
.toast.success { border-color: var(--green); color: var(--green); }
.toast.error   { border-color: var(--red);   color: var(--red); }
.toast.info    { border-color: var(--accent); color: var(--accent); }
@keyframes slideIn { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

.ticket-id { font-family: var(--font); font-size: 11px; color: var(--text3); background: var(--bg3); border: 1px solid var(--border); border-radius: 3px; padding: 1px 6px; }
.overdue-mark { color: var(--red); font-size: 11px; }
.divider { height: 1px; background: var(--border); margin: 12px 0; }
.empty-state { text-align: center; padding: 60px 20px; color: var(--text3); font-size: 13px; }
.empty-icon  { font-size: 40px; margin-bottom: 12px; opacity: .4; }
.confirm-msg { font-size: 13px; color: var(--text); }

@media (max-width: 640px) {
  .form-grid { grid-template-columns: 1fr; }
  .modal { max-height: 100vh; border-radius: 0; }
  .dashboard-grid { grid-template-columns: 1fr; }
  #tabs { overflow-x: auto; }
  .tab { white-space: nowrap; }
}
@media print {
  #topbar, #tabs, .mod-toolbar, .card-actions, .btn { display: none !important; }
  body { background: #fff; color: #000; }
  .card { border: 1px solid #ccc; break-inside: avoid; }
}
```

---

## `index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>IT Support Tracker</title>
<link rel="stylesheet" href="style.css"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet"/>
</head>
<body>

<div id="topbar">
  <div class="logo">IT<span>Tracker</span></div>
  <div class="search-wrap">
    <input type="text" id="search-global" placeholder="Search everything… title, tags, reporter, date" autocomplete="off"/>
  </div>
  <div class="actions">
    <button class="btn btn-ghost btn-sm" id="btn-export">Export CSV</button>
    <button class="btn btn-ghost btn-sm" id="btn-backup">Backup DB</button>
  </div>
</div>

<div id="tabs">
  <div class="tab active" data-tab="dashboard">Dashboard</div>
  <div class="tab" data-tab="issues">Issues</div>
  <div class="tab" data-tab="events">Events</div>
  <div class="tab" data-tab="scripts">Scripts</div>
  <div class="tab" data-tab="kb">Knowledge Base</div>
</div>

<div id="main">

  <!-- DASHBOARD -->
  <div class="module active" id="dashboard-module">
    <div class="mod-toolbar">
      <span style="color:var(--text2);font-size:12px">Drag widgets to reorder · order saved automatically</span>
      <button class="btn btn-ghost btn-sm" id="btn-refresh-dash" style="margin-left:auto">↻ Refresh</button>
    </div>
    <div class="list-area"><div class="dashboard-grid" id="dashboard-grid"></div></div>
  </div>

  <!-- ISSUES -->
  <div class="module" id="issues-module">
    <div class="mod-toolbar">
      <div class="filter-group" id="issue-filters">
        <button class="filter-btn active" data-filter="all">All</button>
        <button class="filter-btn" data-filter="open">Open</button>
        <button class="filter-btn" data-filter="resolved">Resolved</button>
        <button class="filter-btn" data-filter="closed">Closed</button>
        <button class="filter-btn" data-filter="overdue">Overdue</button>
      </div>
      <select id="issue-cat-filter" style="padding:4px 8px;font-size:11px;background:var(--bg3);border:1px solid var(--border);border-radius:3px;color:var(--text2);margin-left:4px">
        <option value="">All Categories</option>
        <option>Hardware</option><option>Software</option><option>Network</option>
        <option>Account</option><option>Security</option><option>Printer</option><option>Other</option>
      </select>
      <div style="margin-left:auto;display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" id="btn-quick-issue">⚡ Quick</button>
        <button class="btn btn-primary btn-sm" id="btn-new-issue">+ New Issue</button>
      </div>
    </div>
    <div class="quick-strip" id="quick-issue-strip">
      <div class="form-group"><label>Title</label><input id="qi-title" placeholder="Brief description"/></div>
      <div class="form-group"><label>Category</label>
        <select id="qi-category">
          <option>Hardware</option><option>Software</option><option>Network</option>
          <option>Account</option><option>Security</option><option>Printer</option><option>Other</option>
        </select>
      </div>
      <div class="form-group"><label>Reporter</label><input id="qi-reporter" placeholder="User name"/></div>
      <div class="form-group"><label>Status</label>
        <select id="qi-status">
          <option>New</option><option>Open</option><option>In Progress</option>
          <option>Waiting for User</option><option>Waiting for Vendor</option>
        </select>
      </div>
      <div class="form-group"><label>Priority</label>
        <select id="qi-priority"><option>Low</option><option selected>Medium</option><option>High</option><option>Critical</option></select>
      </div>
      <button class="btn btn-primary btn-sm" id="btn-qi-save">Save</button>
      <button class="btn btn-ghost btn-sm" id="btn-qi-cancel">✕</button>
    </div>
    <div class="list-area" id="issue-list"><div class="empty-state"><div class="empty-icon">📋</div>No issues yet</div></div>
    <div class="load-more-wrap" id="issue-load-more" style="display:none">
      <button class="btn btn-ghost" id="btn-issue-more">Load More</button>
    </div>
  </div>

  <!-- EVENTS -->
  <div class="module" id="events-module">
    <div class="mod-toolbar">
      <div style="margin-left:auto;display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" id="btn-quick-event">⚡ Quick</button>
        <button class="btn btn-primary btn-sm" id="btn-new-event">+ New Event</button>
      </div>
    </div>
    <div class="quick-strip" id="quick-event-strip">
      <div class="form-group"><label>Subject</label><input id="qe-subject" placeholder="Event subject"/></div>
      <div class="form-group"><label>Type</label>
        <select id="qe-type"><option>Meeting</option><option>Incident</option><option>Training</option><option>Call</option><option>Site Visit</option></select>
      </div>
      <div class="form-group"><label>Date & Time</label><input type="datetime-local" id="qe-date"/></div>
      <button class="btn btn-primary btn-sm" id="btn-qe-save">Save</button>
      <button class="btn btn-ghost btn-sm" id="btn-qe-cancel">✕</button>
    </div>
    <div class="list-area" id="event-list"><div class="empty-state"><div class="empty-icon">📅</div>No events yet</div></div>
    <div class="load-more-wrap" id="event-load-more" style="display:none">
      <button class="btn btn-ghost" id="btn-event-more">Load More</button>
    </div>
  </div>

  <!-- SCRIPTS -->
  <div class="module" id="scripts-module">
    <div class="mod-toolbar">
      <div class="filter-group">
        <button class="filter-btn active" data-sfilter="all">All</button>
        <button class="filter-btn" data-sfilter="pinned">⭐ Pinned</button>
      </div>
      <div style="margin-left:auto;display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" id="btn-quick-script">⚡ Quick</button>
        <button class="btn btn-primary btn-sm" id="btn-new-script">+ New Script</button>
      </div>
    </div>
    <div class="quick-strip" id="quick-script-strip">
      <div class="form-group" style="flex:2"><label>Title</label><input id="qs-title" placeholder="Script name"/></div>
      <div class="form-group" style="flex:3"><label>Command</label><input id="qs-command" placeholder="Command or one-liner"/></div>
      <div class="form-group"><label>Tags</label><input id="qs-tags" placeholder="comma,separated"/></div>
      <button class="btn btn-primary btn-sm" id="btn-qs-save">Save</button>
      <button class="btn btn-ghost btn-sm" id="btn-qs-cancel">✕</button>
    </div>
    <div class="list-area" id="script-list"><div class="empty-state"><div class="empty-icon">⌨️</div>No scripts yet</div></div>
    <div class="load-more-wrap" id="script-load-more" style="display:none">
      <button class="btn btn-ghost" id="btn-script-more">Load More</button>
    </div>
  </div>

  <!-- KNOWLEDGE BASE -->
  <div class="module" id="kb-module">
    <div class="mod-toolbar">
      <div style="margin-left:auto">
        <button class="btn btn-primary btn-sm" id="btn-new-kb">+ New Article</button>
      </div>
    </div>
    <div class="list-area" id="kb-list"><div class="empty-state"><div class="empty-icon">📚</div>No KB articles yet</div></div>
    <div class="load-more-wrap" id="kb-load-more" style="display:none">
      <button class="btn btn-ghost" id="btn-kb-more">Load More</button>
    </div>
  </div>

</div><!-- #main -->

<div id="toast-container"></div>

<!-- ISSUE MODAL -->
<div class="modal-overlay hidden" id="issue-modal">
  <div class="modal modal-lg">
    <div class="modal-header">
      <h3 id="issue-modal-title">New Issue</h3>
      <div class="template-bar">
        <span style="font-size:10px;color:var(--text3);align-self:center;margin-right:2px">TPL:</span>
        <button class="tpl-btn" data-tpl="outlook">Outlook</button>
        <button class="tpl-btn" data-tpl="vpn">VPN</button>
        <button class="tpl-btn" data-tpl="printer">Printer</button>
        <button class="tpl-btn" data-tpl="accountlock">Acct Lock</button>
        <button class="tpl-btn" data-tpl="intune">Intune</button>
        <button class="tpl-btn" data-tpl="network">Network</button>
      </div>
      <button class="btn btn-ghost btn-icon" id="issue-modal-close" style="margin-left:auto">✕</button>
    </div>
    <div class="modal-body">
      <div class="dup-warning" id="dup-warning">⚠ Possible duplicate: <span id="dup-list"></span></div>
      <div class="form-section">
        <div class="form-section-title">Core</div>
        <div class="form-grid">
          <div class="form-group full"><label>Title *</label><input id="f-title" placeholder="Brief issue description" autocomplete="off"/></div>
          <div class="form-group full"><label>Description</label><textarea id="f-desc" rows="3" placeholder="Details, steps to reproduce…"></textarea></div>
          <div class="form-group"><label>Category</label>
            <select id="f-category">
              <option>Hardware</option><option>Software</option><option>Network</option>
              <option>Account</option><option>Security</option><option>Printer</option><option>Other</option>
            </select>
          </div>
          <div class="form-group"><label>Priority</label>
            <select id="f-priority"><option>Low</option><option selected>Medium</option><option>High</option><option>Critical</option></select>
          </div>
          <div class="form-group"><label>Status</label>
            <select id="f-status">
              <option>New</option><option>Open</option><option>In Progress</option>
              <option>Waiting for User</option><option>Waiting for Vendor</option>
              <option>Resolved</option><option>Closed</option><option>Reopened</option>
            </select>
          </div>
          <div class="form-group"><label>Channel</label>
            <select id="f-channel"><option>Email</option><option>Teams</option><option>Verbal</option></select>
          </div>
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">People</div>
        <div class="form-grid">
          <div class="form-group"><label>Reporter</label><input id="f-reporter" placeholder="Requester"/></div>
          <div class="form-group"><label>Assigned To</label><input id="f-assigned" placeholder="Technician"/></div>
          <div class="form-group"><label>Team</label><input id="f-team"/></div>
          <div class="form-group"><label>Owner / Manager</label><input id="f-owner"/></div>
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">Resolution</div>
        <div class="form-grid">
          <div class="form-group full"><label>Resolution</label><textarea id="f-resolution" rows="3" placeholder="What fixed it…"></textarea></div>
          <div class="form-group full"><label>Root Cause</label><textarea id="f-rootcause" rows="2" placeholder="Why it happened…"></textarea></div>
          <div class="form-group"><label>Resolution Type</label>
            <select id="f-restype">
              <option>Workaround</option><option>Permanent Fix</option><option>Vendor</option>
              <option>User Error</option><option selected>Unknown</option>
            </select>
          </div>
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">Details</div>
        <div class="form-grid">
          <div class="form-group"><label>Asset / Device</label><input id="f-asset" placeholder="Hostname, serial…"/></div>
          <div class="form-group"><label>Tags</label><input id="f-tags" placeholder="comma,separated"/></div>
          <div class="form-group"><label>Time Spent (hrs)</label><input type="number" id="f-time" step="0.25" min="0" placeholder="0"/></div>
          <div class="form-group"><label>Due Date</label><input type="date" id="f-due"/></div>
          <div class="form-group"><label>Created At</label><input type="datetime-local" id="f-created"/></div>
          <div class="form-group"><label>Related Event ID</label><input type="number" id="f-relevent" placeholder="Event ID"/></div>
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">Attachments</div>
        <div class="upload-zone" id="issue-upload-zone">
          Drag & drop files here or click to browse<br/>
          <small style="color:var(--text3)">jpg png gif pdf txt log csv docx xlsx · max 20MB</small>
          <input type="file" id="issue-file-input" multiple style="display:none" accept=".jpg,.jpeg,.png,.gif,.pdf,.txt,.log,.csv,.docx,.xlsx"/>
        </div>
        <div class="upload-previews" id="issue-att-preview"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="btn-issue-cancel">Cancel</button>
      <button class="btn btn-success" id="btn-issue-kb" style="display:none">Resolve & Save to KB</button>
      <button class="btn btn-primary" id="btn-issue-save">Save Issue</button>
    </div>
  </div>
</div>

<!-- ISSUE DETAIL MODAL -->
<div class="modal-overlay hidden" id="issue-detail-modal">
  <div class="modal modal-lg">
    <div class="modal-header">
      <h3 id="detail-ticket-id" style="font-family:var(--font);color:var(--accent)"></h3>
      <span id="detail-status-badge"></span>
      <span id="detail-prio-badge" style="margin-left:4px"></span>
      <div style="margin-left:auto;display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" id="btn-detail-copy">Copy Summary</button>
        <button class="btn btn-ghost btn-sm" id="btn-detail-edit">Edit</button>
        <button class="btn btn-ghost btn-icon" id="issue-detail-close">✕</button>
      </div>
    </div>
    <div class="modal-body" id="issue-detail-body"></div>
  </div>
</div>

<!-- EVENT MODAL -->
<div class="modal-overlay hidden" id="event-modal">
  <div class="modal">
    <div class="modal-header">
      <h3 id="event-modal-title">New Event</h3>
      <button class="btn btn-ghost btn-icon" id="event-modal-close" style="margin-left:auto">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full"><label>Subject *</label><input id="ef-subject" placeholder="Event subject"/></div>
        <div class="form-group"><label>Type</label>
          <select id="ef-type"><option>Meeting</option><option>Incident</option><option>Training</option><option>Call</option><option>Site Visit</option></select>
        </div>
        <div class="form-group"><label>Location</label>
          <select id="ef-location"><option>Teams</option><option>Room</option><option>Phone</option><option>On-site</option></select>
        </div>
        <div class="form-group"><label>Date & Time</label><input type="datetime-local" id="ef-date"/></div>
        <div class="form-group"><label>Duration (min)</label><input type="number" id="ef-duration" min="0" placeholder="60"/></div>
        <div class="form-group"><label>Priority</label>
          <select id="ef-priority"><option>Low</option><option selected>Medium</option><option>High</option><option>Critical</option></select>
        </div>
        <div class="form-group"><label>Category</label><input id="ef-category" placeholder="e.g. Deployment"/></div>
        <div class="form-group"><label>Reporter</label><input id="ef-reporter"/></div>
        <div class="form-group full"><label>Attendees</label><input id="ef-attendees" placeholder="Comma-separated names"/></div>
        <div class="form-group full"><label>Description</label><textarea id="ef-description" rows="3"></textarea></div>
        <div class="form-group full"><label>Outcome / Decision</label><textarea id="ef-outcome" rows="2"></textarea></div>
        <div class="form-group full"><label>Action Items</label><textarea id="ef-actions" rows="2" placeholder="- Item 1&#10;- Item 2"></textarea></div>
        <div class="form-group"><label>Follow-up Date</label><input type="date" id="ef-followup"/></div>
        <div class="form-group"><label>Related Issue IDs</label><input id="ef-related" placeholder="12,45"/></div>
        <div class="form-group"><label>Tags</label><input id="ef-tags" placeholder="comma,separated"/></div>
      </div>
      <div style="margin-top:16px">
        <div class="form-section-title">Attachments</div>
        <div class="upload-zone" id="event-upload-zone">
          Drag & drop or click to browse
          <input type="file" id="event-file-input" multiple style="display:none" accept=".jpg,.jpeg,.png,.gif,.pdf,.txt,.log,.csv,.docx,.xlsx"/>
        </div>
        <div class="upload-previews" id="event-att-preview"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="btn-event-cancel">Cancel</button>
      <button class="btn btn-primary" id="btn-event-save">Save Event</button>
    </div>
  </div>
</div>

<!-- SCRIPT MODAL -->
<div class="modal-overlay hidden" id="script-modal">
  <div class="modal">
    <div class="modal-header">
      <h3 id="script-modal-title">New Script</h3>
      <button class="btn btn-ghost btn-icon" id="script-modal-close" style="margin-left:auto">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full"><label>Title *</label><input id="sf-title"/></div>
        <div class="form-group full"><label>Command / Script *</label>
          <textarea id="sf-command" rows="5" style="font-family:var(--font);font-size:12px;color:#7dd3fc" placeholder="# paste command here"></textarea>
        </div>
        <div class="form-group full"><label>Description</label><textarea id="sf-desc" rows="2"></textarea></div>
        <div class="form-group"><label>OS</label>
          <select id="sf-os"><option>Windows</option><option>Linux</option><option>macOS</option><option>Network</option><option>Other</option></select>
        </div>
        <div class="form-group"><label>Risk Level</label>
          <select id="sf-risk"><option>Safe</option><option>Admin</option><option>Destructive</option></select>
        </div>
        <div class="form-group"><label>Category</label><input id="sf-category" placeholder="Cleanup, Diagnostics…"/></div>
        <div class="form-group"><label>Tags</label><input id="sf-tags" placeholder="comma,separated"/></div>
        <div class="form-group full"><label>Notes / Warnings</label><textarea id="sf-notes" rows="2" placeholder="⚠ Prerequisites, warnings…"></textarea></div>
        <div class="form-group full"><label>Example Output</label><textarea id="sf-output" rows="2"></textarea></div>
        <div class="form-group full">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:none;font-size:12px">
            <input type="checkbox" id="sf-pinned" style="width:14px;height:14px"/> Pin to dashboard
          </label>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="btn-script-cancel">Cancel</button>
      <button class="btn btn-primary" id="btn-script-save">Save Script</button>
    </div>
  </div>
</div>

<!-- KB MODAL -->
<div class="modal-overlay hidden" id="kb-modal">
  <div class="modal">
    <div class="modal-header">
      <h3 id="kb-modal-title">New KB Article</h3>
      <button class="btn btn-ghost btn-icon" id="kb-modal-close" style="margin-left:auto">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full"><label>Title *</label><input id="kf-title"/></div>
        <div class="form-group full"><label>Symptoms</label><textarea id="kf-symptoms" rows="3" placeholder="What does the user see?"></textarea></div>
        <div class="form-group full"><label>Cause</label><textarea id="kf-cause" rows="2"></textarea></div>
        <div class="form-group full"><label>Fix / Resolution</label><textarea id="kf-fix" rows="4" placeholder="Step-by-step…"></textarea></div>
        <div class="form-group full"><label>Commands Used</label>
          <textarea id="kf-commands" rows="2" style="font-family:var(--font);font-size:12px" placeholder="gpupdate /force…"></textarea>
        </div>
        <div class="form-group"><label>Tags</label><input id="kf-tags" placeholder="comma,separated"/></div>
        <div class="form-group"><label>Last Tested</label><input type="date" id="kf-tested"/></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="btn-kb-cancel">Cancel</button>
      <button class="btn btn-primary" id="btn-kb-save">Save Article</button>
    </div>
  </div>
</div>

<!-- CONFIRM MODAL -->
<div class="modal-overlay hidden" id="confirm-modal">
  <div class="modal modal-sm">
    <div class="modal-header"><h3>Confirm Delete</h3></div>
    <div class="modal-body" style="padding:18px"><p class="confirm-msg" id="confirm-msg"></p></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="btn-confirm-no">Cancel</button>
      <button class="btn btn-danger" id="btn-confirm-yes">Delete</button>
    </div>
  </div>
</div>

<!-- EXPORT MODAL -->
<div class="modal-overlay hidden" id="export-modal">
  <div class="modal modal-sm">
    <div class="modal-header">
      <h3>Export CSV</h3>
      <button class="btn btn-ghost btn-icon" id="export-modal-close" style="margin-left:auto">✕</button>
    </div>
    <div class="modal-body" style="padding:18px">
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-ghost" data-export="issues">Export Issues</button>
        <button class="btn btn-ghost" data-export="events">Export Events</button>
        <button class="btn btn-ghost" data-export="scripts">Export Scripts</button>
        <button class="btn btn-ghost" data-export="knowledge_base">Export Knowledge Base</button>
      </div>
    </div>
  </div>
</div>

<script src="app.js"></script>
</body>
</html>
```

---

## `app.js`

```javascript
'use strict';

const API = 'api.php';

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

async function api(params, method = 'GET', body = null) {
  const url = API + '?' + new URLSearchParams(params);
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(url, opts);
  return r.json();
}

function toast(msg, type = 'info', dur = 2800) {
  const t = el('div', `toast ${type}`, esc(msg));
  $('toast-container').appendChild(t);
  setTimeout(() => t.remove(), dur);
}

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s.includes('T') ? s : s + 'T00:00:00');
  return d.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function fmtDateOnly(s) {
  if (!s) return '—';
  return new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}
function isOverdue(row) {
  if (!row.due_date) return false;
  if (['Resolved','Closed'].includes(row.status)) return false;
  return new Date(row.due_date) < new Date();
}
function statusClass(s) {
  const m = { 'New':'new','Open':'open','In Progress':'inprogress',
    'Waiting for User':'waiting','Waiting for Vendor':'waiting',
    'Resolved':'resolved','Closed':'closed','Reopened':'reopened' };
  return 'badge badge-status-' + (m[s] || 'new');
}
function prioClass(p) { return 'badge badge-prio-' + (p || 'medium').toLowerCase(); }

function copyText(txt) {
  navigator.clipboard.writeText(txt).then(() => toast('Copied to clipboard', 'success'));
}
function localSave(key, val) { try { localStorage.setItem('itt_' + key, JSON.stringify(val)); } catch(e) {} }
function localLoad(key, def) { try { const v = localStorage.getItem('itt_' + key); return v ? JSON.parse(v) : def; } catch(e) { return def; } }

// Confirm dialog
let _confirmResolve;
function confirmDialog(msg) {
  return new Promise(res => {
    $('confirm-msg').textContent = msg;
    $('confirm-modal').classList.remove('hidden');
    _confirmResolve = res;
  });
}
$('btn-confirm-yes').onclick = () => { $('confirm-modal').classList.add('hidden'); _confirmResolve && _confirmResolve(true); };
$('btn-confirm-no').onclick  = () => { $('confirm-modal').classList.add('hidden'); _confirmResolve && _confirmResolve(false); };

function openModal(id)  { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }

// ── TABS ──────────────────────────────────────────────────
let activeTab = 'dashboard';

document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.module').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    activeTab = t.dataset.tab;
    $(`${activeTab}-module`).classList.add('active');
    loadTab(activeTab);
  };
});

function loadTab(tab) {
  if (tab === 'dashboard') loadDashboard();
  if (tab === 'issues')    loadIssues(true);
  if (tab === 'events')    loadEvents(true);
  if (tab === 'scripts')   loadScripts(true);
  if (tab === 'kb')        loadKB(true);
}

// ── SEARCH ────────────────────────────────────────────────
let _searchTimer;
$('search-global').addEventListener('input', () => {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => loadTab(activeTab), 320);
});
const searchQuery = () => $('search-global').value.trim();

// ── DASHBOARD ─────────────────────────────────────────────
const WIDGET_KEYS = ['open','critical','overdue','resolved_week','time','pinned','recent_kb','categories','recent'];

async function loadDashboard() {
  const data = await api({ type: 'dashboard' });
  const order = localLoad('dash_order', WIDGET_KEYS);
  const grid = $('dashboard-grid');
  grid.innerHTML = '';

  const builders = {
    open:          () => makeStatWidget('Open Issues',     data.open_count,                    data.open_count > 0 ? 'accent' : 'green', 'non-closed tickets'),
    critical:      () => makeStatWidget('Critical',        data.critical,                      data.critical > 0 ? 'red' : 'green',      'open critical priority'),
    overdue:       () => makeStatWidget('Overdue',         data.overdue,                       data.overdue > 0 ? 'orange' : 'green',    'past due date'),
    resolved_week: () => makeStatWidget('Resolved / 7d',   data.resolved_week,                 'green',  'closed this week'),
    time:          () => makeStatWidget('Total Hours',     parseFloat(data.total_time||0).toFixed(1), 'accent', 'logged across all issues'),
    pinned:        () => makeListWidget('⭐ Pinned Scripts', (data.pinned||[]).map(s => `<code style="font-family:var(--font);color:#7dd3fc;font-size:11px">${esc(s.title)}</code>`)),
    recent_kb:     () => makeListWidget('📚 Recent KB',      (data.recent_kb||[]).map(k => esc(k.title))),
    categories:    () => makeCatWidget(data.categories||[]),
    recent:        () => makeRecentWidget(data.recent_items||[]),
  };

  order.forEach(key => {
    if (!builders[key]) return;
    const w = builders[key]();
    w.dataset.widget = key;
    grid.appendChild(w);
  });

  initDashDrag();
}

function makeStatWidget(title, value, color, sub) {
  const w = el('div', 'widget');
  w.innerHTML = `<div class="widget-title">${esc(title)}</div><div class="widget-value ${color}">${esc(String(value))}</div><div class="widget-sub">${esc(sub)}</div>`;
  return w;
}
function makeListWidget(title, items) {
  const w = el('div', 'widget');
  const rows = items.length ? items.map(i => `<li>${i}</li>`).join('') : '<li style="color:var(--text3)">None</li>';
  w.innerHTML = `<div class="widget-title">${esc(title)}</div><ul class="widget-list">${rows}</ul>`;
  return w;
}
function makeCatWidget(cats) {
  const w = el('div', 'widget widget-full');
  const max = Math.max(...cats.map(c => c.cnt), 1);
  const bars = cats.map(c => `<div class="cat-row"><div class="cat-label">${esc(c.category||'Other')}</div><div class="cat-track"><div class="cat-fill" style="width:${Math.round(c.cnt/max*100)}%"></div></div><div class="cat-count">${c.cnt}</div></div>`).join('');
  w.innerHTML = `<div class="widget-title">📊 Top Categories</div>${bars || '<span style="color:var(--text3)">No data</span>'}`;
  return w;
}
function makeRecentWidget(items) {
  const w = el('div', 'widget widget-full');
  const rows = items.map(i => `<li><span style="color:var(--text3);font-size:10px;margin-right:6px">${esc(i.type.toUpperCase())}</span>${esc(i.title||i.ref||'')} <span style="float:right;color:var(--text3)">${fmtDate(i.updated_at)}</span></li>`).join('');
  w.innerHTML = `<div class="widget-title">🕒 Recently Updated</div><ul class="widget-list">${rows || '<li style="color:var(--text3)">Nothing yet</li>'}</ul>`;
  return w;
}

function initDashDrag() {
  let dragging = null;
  document.querySelectorAll('.widget').forEach(w => {
    w.draggable = true;
    w.addEventListener('dragstart', () => { dragging = w; w.classList.add('dragging'); });
    w.addEventListener('dragend',   () => { w.classList.remove('dragging'); dragging = null; saveDashOrder(); });
    w.addEventListener('dragover',  e => { e.preventDefault(); w.classList.add('drag-over'); });
    w.addEventListener('dragleave', () => w.classList.remove('drag-over'));
    w.addEventListener('drop', e => {
      e.preventDefault(); w.classList.remove('drag-over');
      if (dragging && dragging !== w) w.parentNode.insertBefore(dragging, w);
    });
  });
}
function saveDashOrder() {
  localSave('dash_order', [...document.querySelectorAll('.widget')].map(w => w.dataset.widget).filter(Boolean));
}
$('btn-refresh-dash').onclick = loadDashboard;

// ── ISSUES ────────────────────────────────────────────────
let issueOffset = 0, issueTotal = 0, issueFilter = 'all', issueCatFilter = '';
let editingIssueId = null;
let pendingIssueFiles = [];

async function loadIssues(reset = false) {
  if (reset) { issueOffset = 0; issueTotal = 0; }
  const params = { type: 'issue', filter: issueFilter, limit: 50, offset: issueOffset };
  if (issueCatFilter) params.category = issueCatFilter;
  const q = searchQuery(); if (q) params.q = q;
  const data = await api(params);
  issueTotal = data.total || 0;
  const list = $('issue-list');
  if (reset) list.innerHTML = '';
  if (!data.items?.length && issueOffset === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div>No issues found</div>';
  } else {
    (data.items || []).forEach(i => list.appendChild(renderIssueCard(i)));
  }
  issueOffset += (data.items || []).length;
  $('issue-load-more').style.display = issueOffset < issueTotal ? 'block' : 'none';
}

function renderIssueCard(i) {
  const over = isOverdue(i);
  const tags = (i.tags || '').split(',').filter(Boolean).map(t => `<span class="tag">${esc(t.trim())}</span>`).join('');
  const d = el('div', 'card');
  d.dataset.id = i.id;
  d.innerHTML = `
    <div class="card-header">
      <span class="ticket-id">${esc(i.ticket_id || '')}</span>
      ${over ? '<span class="overdue-mark"> ⚠ OVERDUE</span>' : ''}
      <span class="${statusClass(i.status)}" style="margin-left:auto">${esc(i.status)}</span>
      <span class="${prioClass(i.priority)}">${esc(i.priority)}</span>
    </div>
    <div class="card-header" style="margin-bottom:4px">
      <div class="card-title" data-action="expand" style="cursor:pointer">${esc(i.title)}</div>
    </div>
    <div class="card-meta">
      <span class="badge badge-cat">${esc(i.category)}</span>
      ${i.reporter   ? `<span>👤 ${esc(i.reporter)}</span>` : ''}
      ${i.assigned_to ? `<span>🔧 ${esc(i.assigned_to)}</span>` : ''}
      ${i.asset      ? `<span>💻 ${esc(i.asset)}</span>` : ''}
      ${i.time_spent ? `<span>⏱ ${i.time_spent}h</span>` : ''}
      ${i.due_date   ? `<span>📅 ${fmtDateOnly(i.due_date)}</span>` : ''}
      <span style="margin-left:auto;color:var(--text3)">${fmtDate(i.created_at)}</span>
    </div>
    ${tags ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px">${tags}</div>` : ''}
    <div class="card-body">
      ${i.description ? `<div class="detail-section"><div class="detail-label">Description</div><div class="detail-val">${esc(i.description)}</div></div>` : ''}
      ${i.resolution  ? `<div class="detail-section"><div class="detail-label">Resolution</div><div class="detail-val">${esc(i.resolution)}</div></div>` : ''}
      ${(i.attachments||[]).length ? `<div class="detail-section"><div class="detail-label">Attachments (${i.attachments.length})</div><div class="upload-previews">${renderAttThumbs(i.attachments, false)}</div></div>` : ''}
    </div>
    <div class="card-actions">
      <button class="btn btn-ghost btn-xs" data-action="view">View</button>
      <button class="btn btn-ghost btn-xs" data-action="edit">Edit</button>
      <button class="btn btn-ghost btn-xs" data-action="toggle">${['Resolved','Closed'].includes(i.status) ? 'Reopen' : 'Resolve'}</button>
      <button class="btn btn-ghost btn-xs" data-action="copy">Copy</button>
      <button class="btn btn-danger btn-xs" data-action="delete">Delete</button>
    </div>`;
  d.querySelector('[data-action="expand"]').onclick = () => d.classList.toggle('expanded');
  d.querySelector('[data-action="view"]').onclick   = () => openIssueDetail(i.id);
  d.querySelector('[data-action="edit"]').onclick   = () => openIssueForm(i);
  d.querySelector('[data-action="toggle"]').onclick = () => toggleIssueStatus(i);
  d.querySelector('[data-action="copy"]').onclick   = () => copyIssueSummary(i);
  d.querySelector('[data-action="delete"]').onclick = () => deleteIssue(i.id, d);
  return d;
}

function renderAttThumbs(atts, withRemove = false) {
  return (atts || []).map(a => {
    const isImg = /\.(jpg|jpeg|png|gif)$/i.test(a.filename || '');
    const thumb = isImg
      ? `<img src="${API}?type=file&name=${encodeURIComponent(a.filename)}" alt="${esc(a.original_name)}" style="width:72px;height:56px;object-fit:cover;border-radius:4px;border:1px solid var(--border)"/>`
      : `<div class="att-icon">📄</div>`;
    const rm  = withRemove ? `<button class="att-remove" data-att-id="${a.id}">✕</button>` : '';
    const dl  = `<a href="${API}?type=file&name=${encodeURIComponent(a.filename)}" download="${esc(a.original_name)}" class="btn btn-ghost btn-xs" style="margin-top:2px;font-size:9px">↓ dl</a>`;
    return `<div class="att-thumb">${rm}${thumb}<div class="att-name">${esc((a.original_name||'').slice(0,14))}</div>${dl}</div>`;
  }).join('');
}

async function openIssueDetail(id) {
  const data = await api({ type: 'issue', id });
  $('detail-ticket-id').textContent = data.ticket_id || '';
  $('detail-status-badge').innerHTML = `<span class="${statusClass(data.status)}">${esc(data.status)}</span>`;
  $('detail-prio-badge').innerHTML   = `<span class="${prioClass(data.priority)}">${esc(data.priority)}</span>`;
  $('btn-detail-edit').onclick  = () => { closeModal('issue-detail-modal'); openIssueForm(data); };
  $('btn-detail-copy').onclick  = () => copyIssueSummary(data);
  const tl = (data.activity || []).map(a => `
    <div class="timeline-item">
      <span class="tl-action">${esc(a.action)}</span>${a.detail ? ' — ' + esc(a.detail) : ''}
      <span class="tl-time">${fmtDate(a.created_at)}</span>
    </div>`).join('');
  $('issue-detail-body').innerHTML = `
    <div class="form-grid" style="margin-bottom:14px">
      <div><div class="detail-label">Category</div><div class="detail-val">${esc(data.category)}</div></div>
      <div><div class="detail-label">Channel</div><div class="detail-val">${esc(data.channel)}</div></div>
      <div><div class="detail-label">Reporter</div><div class="detail-val">${esc(data.reporter)||'—'}</div></div>
      <div><div class="detail-label">Assigned To</div><div class="detail-val">${esc(data.assigned_to)||'—'}</div></div>
      <div><div class="detail-label">Asset</div><div class="detail-val">${esc(data.asset)||'—'}</div></div>
      <div><div class="detail-label">Time Spent</div><div class="detail-val">${data.time_spent||0}h</div></div>
      <div><div class="detail-label">Due Date</div><div class="detail-val">${fmtDateOnly(data.due_date)}</div></div>
      <div><div class="detail-label">Created</div><div class="detail-val">${fmtDate(data.created_at)}</div></div>
    </div>
    ${data.description ? `<div class="detail-section"><div class="detail-label">Description</div><div class="detail-val">${esc(data.description)}</div></div>` : ''}
    ${data.resolution  ? `<div class="detail-section"><div class="detail-label">Resolution</div><div class="detail-val">${esc(data.resolution)}</div></div>` : ''}
    ${data.root_cause  ? `<div class="detail-section"><div class="detail-label">Root Cause</div><div class="detail-val">${esc(data.root_cause)}</div></div>` : ''}
    ${(data.attachments||[]).length ? `<div class="detail-section"><div class="detail-label">Attachments</div><div class="upload-previews">${renderAttThumbs(data.attachments)}</div></div>` : ''}
    ${tl ? `<div class="divider"></div><div class="form-section-title">Activity Timeline</div><div class="timeline">${tl}</div>` : ''}`;
  openModal('issue-detail-modal');
}

function copyIssueSummary(i) {
  const txt = [`Ticket: ${i.ticket_id}`,`Title: ${i.title}`,`Status: ${i.status}`,`Priority: ${i.priority}`,
    `Category: ${i.category}`,`Reporter: ${i.reporter||'—'}`,`Assigned: ${i.assigned_to||'—'}`,
    i.description ? `\nDescription:\n${i.description}` : '',
    i.resolution  ? `\nResolution:\n${i.resolution}` : ''].filter(Boolean).join('\n');
  copyText(txt);
}

async function toggleIssueStatus(i) {
  const newStatus = ['Resolved','Closed'].includes(i.status) ? 'Reopened' : 'Resolved';
  await api({ type: 'issue', id: i.id }, 'PUT', { ...i, status: newStatus });
  toast(`Issue ${newStatus.toLowerCase()}`, 'success');
  loadIssues(true);
}

async function deleteIssue(id, card) {
  const ok = await confirmDialog('Soft-delete this issue? It will be hidden but not permanently removed.');
  if (!ok) return;
  await api({ type: 'issue', id }, 'DELETE');
  card.remove();
  toast('Issue deleted', 'success');
}

// Issue form
function openIssueForm(issue = null) {
  editingIssueId = issue ? issue.id : null;
  pendingIssueFiles = [];
  $('issue-modal-title').textContent = issue ? `Edit: ${issue.ticket_id}` : 'New Issue';
  $('btn-issue-kb').style.display = issue ? 'inline-flex' : 'none';
  $('dup-warning').classList.remove('visible');

  const def = issue || localLoad('issue_defaults', {});
  $('f-title').value      = issue?.title || '';
  $('f-desc').value       = issue?.description || '';
  $('f-resolution').value = issue?.resolution || '';
  $('f-rootcause').value  = issue?.root_cause || '';
  $('f-restype').value    = issue?.resolution_type || def.resolution_type || 'Unknown';
  $('f-category').value   = issue?.category || def.category || 'Other';
  $('f-priority').value   = issue?.priority || def.priority || 'Medium';
  $('f-status').value     = issue?.status   || def.status   || 'New';
  $('f-channel').value    = issue?.channel  || def.channel  || 'Email';
  $('f-reporter').value   = issue?.reporter || def.reporter || '';
  $('f-assigned').value   = issue?.assigned_to || def.assigned_to || '';
  $('f-team').value       = issue?.team  || def.team  || '';
  $('f-owner').value      = issue?.owner || def.owner || '';
  $('f-asset').value      = issue?.asset || '';
  $('f-tags').value       = issue?.tags  || '';
  $('f-time').value       = issue?.time_spent || '';
  $('f-due').value        = issue?.due_date   || '';
  $('f-relevent').value   = issue?.related_event || '';
  if (issue?.created_at) {
    $('f-created').value = issue.created_at.replace(' ','T').slice(0,16);
  } else {
    const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    $('f-created').value = now.toISOString().slice(0,16);
  }
  const prev = $('issue-att-preview');
  prev.innerHTML = issue ? renderAttThumbs(issue.attachments || [], true) : '';
  prev.querySelectorAll('.att-remove').forEach(btn => {
    btn.onclick = async () => { await api({ type: 'attachment', id: btn.dataset.attId }, 'DELETE'); btn.closest('.att-thumb').remove(); };
  });
  openModal('issue-modal');
}

// Duplicate detection
let _dupTimer;
$('f-title').addEventListener('input', () => {
  clearTimeout(_dupTimer);
  const v = $('f-title').value.trim();
  if (v.length < 4) { $('dup-warning').classList.remove('visible'); return; }
  _dupTimer = setTimeout(async () => {
    const data = await api({ type: 'duplicate_check', title: v });
    const dups = (data.duplicates || []).filter(d => d.id !== editingIssueId);
    if (dups.length) {
      $('dup-list').innerHTML = dups.map(d => `<strong>${esc(d.ticket_id)}</strong>: ${esc(d.title)} [${esc(d.status)}]`).join(' | ');
      $('dup-warning').classList.add('visible');
    } else {
      $('dup-warning').classList.remove('visible');
    }
  }, 400);
});

// Templates
const TEMPLATES = {
  outlook:     { title:'Outlook not opening / crashing', category:'Software', priority:'Medium', tags:'outlook,office365', description:'User reports Outlook not starting or crashing on launch.\n\nSteps:\n1. Launch Outlook\n2. Application crashes or hangs' },
  vpn:         { title:'VPN connection failure', category:'Network', priority:'High', tags:'vpn,network,remote', description:'User unable to connect to VPN.\n\nError message: \nOS: \nLast working: ' },
  printer:     { title:'Printer not printing / offline', category:'Printer', priority:'Low', tags:'printer,printing', description:'User reports printer offline or jobs stuck in queue.\n\nPrinter model: \nLocation: ' },
  accountlock: { title:'Account locked out', category:'Account', priority:'High', tags:'ad,account,lockout', description:'User account locked after failed login attempts.\n\nUsername: \nLast known location: ', resolution:'Unlocked via AD. User reset password.' },
  intune:      { title:'Intune device enrollment failure', category:'Software', priority:'Medium', tags:'intune,mdm,enrollment', description:'Device fails to enroll in Intune MDM.\n\nDevice: \nOS version: \nError code: ' },
  network:     { title:'No network / internet connectivity', category:'Network', priority:'High', tags:'network,connectivity,lan', description:'User has no network access.\n\nLocation: \nDevice: \nSwitch port: \nLast working: ' },
};
document.querySelectorAll('.tpl-btn').forEach(btn => {
  btn.onclick = () => {
    const t = TEMPLATES[btn.dataset.tpl]; if (!t) return;
    $('f-title').value       = t.title       || '';
    $('f-category').value    = t.category    || 'Other';
    $('f-priority').value    = t.priority    || 'Medium';
    $('f-desc').value        = t.description || '';
    $('f-resolution').value  = t.resolution  || '';
    $('f-tags').value        = t.tags        || '';
  };
});

$('btn-issue-save').onclick = async () => {
  const title = $('f-title').value.trim();
  if (!title) { toast('Title is required', 'error'); return; }
  const payload = {
    title, description: $('f-desc').value, resolution: $('f-resolution').value,
    root_cause: $('f-rootcause').value, resolution_type: $('f-restype').value,
    category: $('f-category').value, priority: $('f-priority').value,
    status: $('f-status').value, channel: $('f-channel').value,
    reporter: $('f-reporter').value, assigned_to: $('f-assigned').value,
    team: $('f-team').value, owner: $('f-owner').value,
    asset: $('f-asset').value, tags: $('f-tags').value,
    time_spent: $('f-time').value || 0, due_date: $('f-due').value || null,
    related_event: $('f-relevent').value || null,
    created_at: $('f-created').value ? $('f-created').value.replace('T',' ') : null,
  };
  localSave('issue_defaults', { category: payload.category, priority: payload.priority, status: payload.status, channel: payload.channel, reporter: payload.reporter, assigned_to: payload.assigned_to, team: payload.team, owner: payload.owner });
  let result;
  if (editingIssueId) result = await api({ type: 'issue', id: editingIssueId }, 'PUT', payload);
  else                result = await api({ type: 'issue' }, 'POST', payload);
  if (result.error) { toast(result.error, 'error'); return; }
  if (pendingIssueFiles.length) await uploadFiles(pendingIssueFiles, 'issue', result.id);
  closeModal('issue-modal');
  toast(editingIssueId ? 'Issue updated' : 'Issue created', 'success');
  loadIssues(true);
};

$('btn-issue-kb').onclick = async () => {
  const resolution = $('f-resolution').value.trim();
  if (!resolution) { toast('Add a resolution first', 'error'); return; }
  const savedId = editingIssueId;
  await $('btn-issue-save').click();
  setTimeout(() => openKBForm(null, { title: $('f-title')?.value || '', symptoms: $('f-desc')?.value || '', fix: resolution, tags: $('f-tags')?.value || '', source_issue_id: savedId }), 500);
};

['issue-modal-close','btn-issue-cancel'].forEach(id => $(id).onclick = () => closeModal('issue-modal'));
$('issue-detail-close').onclick = () => closeModal('issue-detail-modal');

document.querySelectorAll('#issue-filters .filter-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('#issue-filters .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    issueFilter = btn.dataset.filter;
    loadIssues(true);
  };
});
$('issue-cat-filter').onchange = e => { issueCatFilter = e.target.value; loadIssues(true); };
$('btn-new-issue').onclick  = () => openIssueForm();
$('btn-issue-more').onclick = () => loadIssues(false);

$('btn-quick-issue').onclick = () => $('quick-issue-strip').classList.toggle('open');
$('btn-qi-cancel').onclick   = () => $('quick-issue-strip').classList.remove('open');
$('btn-qi-save').onclick = async () => {
  const title = $('qi-title').value.trim();
  if (!title) { toast('Title required', 'error'); return; }
  await api({ type: 'issue' }, 'POST', { title, category: $('qi-category').value, reporter: $('qi-reporter').value, status: $('qi-status').value, priority: $('qi-priority').value });
  $('qi-title').value = '';
  $('quick-issue-strip').classList.remove('open');
  toast('Issue created', 'success');
  loadIssues(true);
};

// ── EVENTS ────────────────────────────────────────────────
let eventOffset = 0, editingEventId = null;
let pendingEventFiles = [];

async function loadEvents(reset = false) {
  if (reset) eventOffset = 0;
  const params = { type: 'event', limit: 50, offset: eventOffset };
  const q = searchQuery(); if (q) params.q = q;
  const data = await api(params);
  const list = $('event-list');
  if (reset) list.innerHTML = '';
  if (!data.items?.length && eventOffset === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div>No events found</div>';
  } else {
    (data.items || []).forEach(ev => list.appendChild(renderEventCard(ev)));
  }
  eventOffset += (data.items || []).length;
  $('event-load-more').style.display = (data.items || []).length === 50 ? 'block' : 'none';
}

function renderEventCard(ev) {
  const tags = (ev.tags || '').split(',').filter(Boolean).map(t => `<span class="tag">${esc(t.trim())}</span>`).join('');
  const d = el('div', 'card');
  d.innerHTML = `
    <div class="card-header">
      <span class="badge badge-cat">${esc(ev.event_type)}</span>
      <span class="badge badge-os">${esc(ev.location)}</span>
      <span class="${prioClass(ev.priority)}" style="margin-left:auto">${esc(ev.priority)}</span>
    </div>
    <div class="card-header" style="margin-bottom:4px">
      <div class="card-title" data-action="expand" style="cursor:pointer">${esc(ev.subject)}</div>
    </div>
    <div class="card-meta">
      ${ev.event_date  ? `<span>📅 ${fmtDate(ev.event_date)}</span>` : ''}
      ${ev.duration    ? `<span>⏱ ${ev.duration}min</span>` : ''}
      ${ev.reporter    ? `<span>👤 ${esc(ev.reporter)}</span>` : ''}
      ${ev.attendees   ? `<span>👥 ${esc(ev.attendees)}</span>` : ''}
      <span style="margin-left:auto;color:var(--text3)">${fmtDate(ev.created_at)}</span>
    </div>
    ${tags ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px">${tags}</div>` : ''}
    <div class="card-body">
      ${ev.description  ? `<div class="detail-section"><div class="detail-label">Description</div><div class="detail-val">${esc(ev.description)}</div></div>` : ''}
      ${ev.outcome      ? `<div class="detail-section"><div class="detail-label">Outcome</div><div class="detail-val">${esc(ev.outcome)}</div></div>` : ''}
      ${ev.action_items ? `<div class="detail-section"><div class="detail-label">Action Items</div><div class="detail-val">${esc(ev.action_items)}</div></div>` : ''}
    </div>
    <div class="card-actions">
      <button class="btn btn-ghost btn-xs" data-action="expand">Details</button>
      <button class="btn btn-ghost btn-xs" data-action="edit">Edit</button>
      <button class="btn btn-danger btn-xs" data-action="delete">Delete</button>
    </div>`;
  d.querySelector('[data-action="expand"]').onclick = () => d.classList.toggle('expanded');
  d.querySelector('[data-action="edit"]').onclick   = () => openEventForm(ev);
  d.querySelector('[data-action="delete"]').onclick = async () => {
    const ok = await confirmDialog('Soft-delete this event?');
    if (!ok) return;
    await api({ type: 'event', id: ev.id }, 'DELETE');
    d.remove(); toast('Event deleted', 'success');
  };
  return d;
}

function openEventForm(ev = null) {
  editingEventId = ev ? ev.id : null;
  pendingEventFiles = [];
  $('event-modal-title').textContent = ev ? 'Edit Event' : 'New Event';
  const def = ev || localLoad('event_defaults', {});
  $('ef-subject').value     = ev?.subject      || '';
  $('ef-type').value        = ev?.event_type   || def.event_type || 'Meeting';
  $('ef-location').value    = ev?.location     || def.location   || 'Teams';
  $('ef-date').value        = ev?.event_date   ? ev.event_date.replace(' ','T').slice(0,16) : '';
  $('ef-duration').value    = ev?.duration     || '';
  $('ef-priority').value    = ev?.priority     || def.priority   || 'Medium';
  $('ef-category').value    = ev?.category     || '';
  $('ef-reporter').value    = ev?.reporter     || def.reporter   || '';
  $('ef-attendees').value   = ev?.attendees    || '';
  $('ef-description').value = ev?.description  || '';
  $('ef-outcome').value     = ev?.outcome      || '';
  $('ef-actions').value     = ev?.action_items || '';
  $('ef-followup').value    = ev?.followup_date || '';
  $('ef-related').value     = ev?.related_issues || '';
  $('ef-tags').value        = ev?.tags         || '';
  $('event-att-preview').innerHTML = ev ? renderAttThumbs(ev.attachments || [], true) : '';
  openModal('event-modal');
}

$('btn-event-save').onclick = async () => {
  const subject = $('ef-subject').value.trim();
  if (!subject) { toast('Subject required', 'error'); return; }
  const payload = {
    subject, event_type: $('ef-type').value, location: $('ef-location').value,
    event_date: $('ef-date').value ? $('ef-date').value.replace('T',' ') : null,
    duration: $('ef-duration').value || null, priority: $('ef-priority').value,
    category: $('ef-category').value, reporter: $('ef-reporter').value,
    attendees: $('ef-attendees').value, description: $('ef-description').value,
    outcome: $('ef-outcome').value, action_items: $('ef-actions').value,
    followup_date: $('ef-followup').value || null, related_issues: $('ef-related').value,
    tags: $('ef-tags').value,
  };
  localSave('event_defaults', { event_type: payload.event_type, location: payload.location, priority: payload.priority, reporter: payload.reporter });
  let result;
  if (editingEventId) result = await api({ type: 'event', id: editingEventId }, 'PUT', payload);
  else                result = await api({ type: 'event' }, 'POST', payload);
  if (result.error) { toast(result.error, 'error'); return; }
  if (pendingEventFiles.length) await uploadFiles(pendingEventFiles, 'event', result.id);
  closeModal('event-modal');
  toast(editingEventId ? 'Event updated' : 'Event created', 'success');
  loadEvents(true);
};

$('btn-new-event').onclick = () => openEventForm();
['event-modal-close','btn-event-cancel'].forEach(id => $(id).onclick = () => closeModal('event-modal'));
$('btn-event-more').onclick = () => loadEvents(false);

$('btn-quick-event').onclick = () => $('quick-event-strip').classList.toggle('open');
$('btn-qe-cancel').onclick   = () => $('quick-event-strip').classList.remove('open');
$('btn-qe-save').onclick = async () => {
  const subject = $('qe-subject').value.trim();
  if (!subject) { toast('Subject required', 'error'); return; }
  await api({ type: 'event' }, 'POST', { subject, event_type: $('qe-type').value, event_date: $('qe-date').value ? $('qe-date').value.replace('T',' ') : null });
  $('qe-subject').value = '';
  $('quick-event-strip').classList.remove('open');
  toast('Event created', 'success');
  loadEvents(true);
};

// ── SCRIPTS ───────────────────────────────────────────────
let scriptOffset = 0, scriptFilter = 'all', editingScriptId = null;

async function loadScripts(reset = false) {
  if (reset) scriptOffset = 0;
  const params = { type: 'script', limit: 50, offset: scriptOffset };
  if (scriptFilter === 'pinned') params.pinned = '1';
  const q = searchQuery(); if (q) params.q = q;
  const data = await api(params);
  const list = $('script-list');
  if (reset) list.innerHTML = '';
  if (!data.items?.length && scriptOffset === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">⌨️</div>No scripts found</div>';
  } else {
    (data.items || []).forEach(s => list.appendChild(renderScriptCard(s)));
  }
  scriptOffset += (data.items || []).length;
  $('script-load-more').style.display = (data.items || []).length === 50 ? 'block' : 'none';
}

function renderScriptCard(s) {
  const tags = (s.tags || '').split(',').filter(Boolean).map(t => `<span class="tag">${esc(t.trim())}</span>`).join('');
  const riskCls = { Safe:'safe', Admin:'admin', Destructive:'destructive' }[s.risk_level] || 'safe';
  const d = el('div', 'card');
  d.innerHTML = `
    <div class="card-header" style="margin-bottom:6px">
      <div class="card-title">${s.pinned ? '⭐ ' : ''}${esc(s.title)}</div>
      <span class="badge badge-os">${esc(s.os)}</span>
      <span class="badge badge-risk-${riskCls}">${esc(s.risk_level)}</span>
    </div>
    <div class="code-block" style="position:relative">
      <button class="btn btn-ghost btn-xs copy-btn-code" onclick="copyText(${JSON.stringify(s.command)})">Copy</button>${esc(s.command)}</div>
    ${tags ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">${tags}</div>` : ''}
    <div class="card-body" style="margin-top:8px">
      ${s.description ? `<div class="detail-section"><div class="detail-label">Description</div><div class="detail-val">${esc(s.description)}</div></div>` : ''}
      ${s.notes ? `<div class="detail-section"><div class="detail-label">⚠ Notes</div><div class="detail-val" style="color:var(--yellow)">${esc(s.notes)}</div></div>` : ''}
      ${s.example_output ? `<div class="detail-section"><div class="detail-label">Example Output</div><div class="code-block">${esc(s.example_output)}</div></div>` : ''}
    </div>
    <div class="card-actions">
      <button class="btn btn-ghost btn-xs" data-action="expand">Details</button>
      <button class="btn btn-ghost btn-xs" data-action="edit">Edit</button>
      <button class="btn btn-ghost btn-xs" data-action="pin">${s.pinned ? 'Unpin' : '⭐ Pin'}</button>
      <button class="btn btn-danger btn-xs" data-action="delete">Delete</button>
    </div>`;
  d.querySelector('[data-action="expand"]').onclick = () => d.classList.toggle('expanded');
  d.querySelector('[data-action="edit"]').onclick   = () => openScriptForm(s);
  d.querySelector('[data-action="pin"]').onclick    = async () => {
    await api({ type: 'script', id: s.id }, 'PUT', { ...s, pinned: s.pinned ? 0 : 1 });
    toast(s.pinned ? 'Unpinned' : 'Pinned ⭐', 'success');
    loadScripts(true);
  };
  d.querySelector('[data-action="delete"]').onclick = async () => {
    const ok = await confirmDialog('Soft-delete this script?');
    if (!ok) return;
    await api({ type: 'script', id: s.id }, 'DELETE');
    d.remove(); toast('Script deleted', 'success');
  };
  return d;
}

function openScriptForm(s = null) {
  editingScriptId = s ? s.id : null;
  $('script-modal-title').textContent = s ? 'Edit Script' : 'New Script';
  const def = s || localLoad('script_defaults', {});
  $('sf-title').value    = s?.title          || '';
  $('sf-command').value  = s?.command        || '';
  $('sf-desc').value     = s?.description    || '';
  $('sf-os').value       = s?.os             || def.os || 'Windows';
  $('sf-risk').value     = s?.risk_level     || 'Safe';
  $('sf-category').value = s?.category       || '';
  $('sf-tags').value     = s?.tags           || '';
  $('sf-notes').value    = s?.notes          || '';
  $('sf-output').value   = s?.example_output || '';
  $('sf-pinned').checked = !!(s?.pinned);
  openModal('script-modal');
}

$('btn-script-save').onclick = async () => {
  const title = $('sf-title').value.trim(), command = $('sf-command').value.trim();
  if (!title || !command) { toast('Title and command required', 'error'); return; }
  const payload = { title, command, description: $('sf-desc').value, os: $('sf-os').value,
    risk_level: $('sf-risk').value, category: $('sf-category').value, tags: $('sf-tags').value,
    notes: $('sf-notes').value, example_output: $('sf-output').value, pinned: $('sf-pinned').checked ? 1 : 0 };
  localSave('script_defaults', { os: payload.os });
  if (editingScriptId) await api({ type: 'script', id: editingScriptId }, 'PUT', payload);
  else                 await api({ type: 'script' }, 'POST', payload);
  closeModal('script-modal');
  toast(editingScriptId ? 'Script updated' : 'Script saved', 'success');
  loadScripts(true);
};

$('btn-new-script').onclick = () => openScriptForm();
['script-modal-close','btn-script-cancel'].forEach(id => $(id).onclick = () => closeModal('script-modal'));

document.querySelectorAll('[data-sfilter]').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('[data-sfilter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    scriptFilter = btn.dataset.sfilter;
    loadScripts(true);
  };
});
$('btn-script-more').onclick = () => loadScripts(false);

$('btn-quick-script').onclick = () => $('quick-script-strip').classList.toggle('open');
$('btn-qs-cancel').onclick    = () => $('quick-script-strip').classList.remove('open');
$('btn-qs-save').onclick = async () => {
  const title = $('qs-title').value.trim(), command = $('qs-command').value.trim();
  if (!title || !command) { toast('Title and command required', 'error'); return; }
  await api({ type: 'script' }, 'POST', { title, command, tags: $('qs-tags').value });
  $('qs-title').value = ''; $('qs-command').value = ''; $('qs-tags').value = '';
  $('quick-script-strip').classList.remove('open');
  toast('Script saved', 'success');
  loadScripts(true);
};

// ── KNOWLEDGE BASE ────────────────────────────────────────
let kbOffset = 0, editingKBId = null;

async function loadKB(reset = false) {
  if (reset) kbOffset = 0;
  const params = { type: 'kb', limit: 50, offset: kbOffset };
  const q = searchQuery(); if (q) params.q = q;
  const data = await api(params);
  const list = $('kb-list');
  if (reset) list.innerHTML = '';
  if (!data.items?.length && kbOffset === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📚</div>No KB articles found</div>';
  } else {
    (data.items || []).forEach(k => list.appendChild(renderKBCard(k)));
  }
  kbOffset += (data.items || []).length;
  $('kb-load-more').style.display = (data.items || []).length === 50 ? 'block' : 'none';
}

function renderKBCard(k) {
  const tags = (k.tags || '').split(',').filter(Boolean).map(t => `<span class="tag">${esc(t.trim())}</span>`).join('');
  const d = el('div', 'card');
  d.innerHTML = `
    <div class="card-header" style="margin-bottom:6px">
      <div class="card-title" data-action="expand" style="cursor:pointer">${esc(k.title)}</div>
      ${k.last_tested ? `<span style="font-size:10px;color:var(--text3)">Tested: ${fmtDateOnly(k.last_tested)}</span>` : ''}
    </div>
    ${tags ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">${tags}</div>` : ''}
    <div class="card-body">
      ${k.symptoms ? `<div class="detail-section"><div class="detail-label">Symptoms</div><div class="detail-val">${esc(k.symptoms)}</div></div>` : ''}
      ${k.cause    ? `<div class="detail-section"><div class="detail-label">Cause</div><div class="detail-val">${esc(k.cause)}</div></div>` : ''}
      ${k.fix      ? `<div class="detail-section"><div class="detail-label">Fix / Resolution</div><div class="detail-val">${esc(k.fix)}</div></div>` : ''}
      ${k.commands_used ? `<div class="detail-section"><div class="detail-label">Commands</div><div class="code-block" style="position:relative"><button class="btn btn-ghost btn-xs copy-btn-code" onclick="copyText(${JSON.stringify(k.commands_used)})">Copy</button>${esc(k.commands_used)}</div></div>` : ''}
    </div>
    <div class="card-actions">
      <button class="btn btn-ghost btn-xs" data-action="expand">Details</button>
      <button class="btn btn-ghost btn-xs" data-action="edit">Edit</button>
      <button class="btn btn-ghost btn-xs" data-action="copy">Copy Fix</button>
      <button class="btn btn-danger btn-xs" data-action="delete">Delete</button>
    </div>`;
  d.querySelector('[data-action="expand"]').onclick = () => d.classList.toggle('expanded');
  d.querySelector('[data-action="edit"]').onclick   = () => openKBForm(k);
  d.querySelector('[data-action="copy"]').onclick   = () => copyText(k.fix || k.title);
  d.querySelector('[data-action="delete"]').onclick = async () => {
    const ok = await confirmDialog('Soft-delete this KB article?');
    if (!ok) return;
    await api({ type: 'kb', id: k.id }, 'DELETE');
    d.remove(); toast('KB article deleted', 'success');
  };
  return d;
}

function openKBForm(k = null, prefill = null) {
  editingKBId = k ? k.id : null;
  $('kb-modal-title').textContent = k ? 'Edit KB Article' : 'New KB Article';
  const src = k || prefill || {};
  $('kf-title').value    = src.title        || '';
  $('kf-symptoms').value = src.symptoms     || '';
  $('kf-cause').value    = src.cause        || '';
  $('kf-fix').value      = src.fix          || '';
  $('kf-commands').value = src.commands_used || '';
  $('kf-tags').value     = src.tags         || '';
  $('kf-tested').value   = src.last_tested  || '';
  $('kb-modal').dataset.sourceIssue = src.source_issue_id || '';
  openModal('kb-modal');
}

$('btn-kb-save').onclick = async () => {
  const title = $('kf-title').value.trim();
  if (!title) { toast('Title required', 'error'); return; }
  const payload = { title, symptoms: $('kf-symptoms').value, cause: $('kf-cause').value,
    fix: $('kf-fix').value, commands_used: $('kf-commands').value, tags: $('kf-tags').value,
    last_tested: $('kf-tested').value || null,
    source_issue_id: $('kb-modal').dataset.sourceIssue || null };
  if (editingKBId) await api({ type: 'kb', id: editingKBId }, 'PUT', payload);
  else             await api({ type: 'kb' }, 'POST', payload);
  closeModal('kb-modal');
  toast(editingKBId ? 'Article updated' : 'Article created', 'success');
  loadKB(true);
};

$('btn-new-kb').onclick = () => openKBForm();
['kb-modal-close','btn-kb-cancel'].forEach(id => $(id).onclick = () => closeModal('kb-modal'));
$('btn-kb-more').onclick = () => loadKB(false);

// ── FILE UPLOAD ───────────────────────────────────────────
function setupUploadZone(zoneId, inputId, previewId, fileStore) {
  const zone = $(zoneId), input = $(inputId), preview = $(previewId);
  const ALLOWED = ['jpg','jpeg','png','gif','pdf','txt','log','csv','docx','xlsx'];

  function handleFiles(files) {
    [...files].forEach(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      if (!ALLOWED.includes(ext)) { toast(`${f.name}: type not allowed`, 'error'); return; }
      if (f.size > 20 * 1024 * 1024) { toast(`${f.name}: too large (max 20MB)`, 'error'); return; }
      fileStore.push(f);
      const thumb = el('div', 'att-thumb');
      const rm = el('button', 'att-remove', '✕');
      rm.onclick = () => { fileStore.splice(fileStore.indexOf(f), 1); thumb.remove(); };
      if (f.type.startsWith('image/')) {
        const img = el('img'); img.src = URL.createObjectURL(f);
        img.style.cssText = 'width:72px;height:56px;object-fit:cover;border-radius:4px;border:1px solid var(--border)';
        thumb.appendChild(rm); thumb.appendChild(img);
      } else {
        thumb.appendChild(rm); thumb.appendChild(el('div','att-icon','📄'));
      }
      thumb.appendChild(el('div','att-name', esc(f.name.slice(0,14))));
      preview.appendChild(thumb);
    });
  }

  zone.onclick = () => input.click();
  input.onchange = e => handleFiles(e.target.files);
  zone.ondragover  = e => { e.preventDefault(); zone.classList.add('drag-over'); };
  zone.ondragleave = () => zone.classList.remove('drag-over');
  zone.ondrop = e => { e.preventDefault(); zone.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); };
}

async function uploadFiles(files, parentType, parentId) {
  if (!files.length) return;
  const fd = new FormData();
  fd.append('parent_type', parentType);
  fd.append('parent_id', String(parentId));
  files.forEach(f => fd.append('files[]', f));
  await fetch(`${API}?type=upload`, { method: 'POST', body: fd });
}

setupUploadZone('issue-upload-zone', 'issue-file-input', 'issue-att-preview', pendingIssueFiles);
setupUploadZone('event-upload-zone', 'event-file-input', 'event-att-preview', pendingEventFiles);

// ── EXPORT ────────────────────────────────────────────────
$('btn-export').onclick = () => openModal('export-modal');
$('export-modal-close').onclick = () => closeModal('export-modal');
document.querySelectorAll('[data-export]').forEach(btn => {
  btn.onclick = async () => {
    const data = await api({ type: 'export', table: btn.dataset.export });
    if (!data.csv) { toast('No data to export', 'error'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data.csv], { type: 'text/csv' }));
    a.download = `${btn.dataset.export}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    closeModal('export-modal');
  };
});

$('btn-backup').onclick = () => { window.location.href = `${API}?type=backup`; };

// ── BOOT ─────────────────────────────────────────────────
loadDashboard();
```

---

**Deploy:**
```bash
cp api.php index.html style.css app.js /var/www/html/
mkdir -p /var/www/html/uploads /var/www/html/data
chown -R www-data:www-data /var/www/html/uploads /var/www/html/data
```

Open `http://localhost/` — DB, all tables, and FTS5 virtual tables auto-create on first request. No migrations needed.
