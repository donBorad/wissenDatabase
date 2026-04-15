<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

$db = new PDO('sqlite:' . __DIR__ . '/issues.db');
$db->exec("CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  desc TEXT NOT NULL,
  resolution TEXT,
  status TEXT DEFAULT 'open',
  priority TEXT DEFAULT 'medium',
  reporter TEXT,
  owner TEXT,
  channel TEXT DEFAULT 'email',
  time_spent REAL DEFAULT 0,
  date TEXT NOT NULL
)");

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'OPTIONS') { http_response_code(200); exit; }

preg_match('/\/api\.php\/(\d+)$/', $_SERVER['REQUEST_URI'], $m);
$id = $m[1] ?? null;

if ($method === 'GET') {
  echo json_encode($db->query("SELECT * FROM issues ORDER BY date DESC")->fetchAll(PDO::FETCH_ASSOC));

} elseif ($method === 'POST') {
  $d = json_decode(file_get_contents('php://input'), true);
  $db->prepare("INSERT INTO issues VALUES (?,?,?,?,?,?,?,?,?,?,?)")
     ->execute([$d['id'],$d['title'],$d['desc'],$d['resolution'],$d['status'],$d['priority'],$d['reporter'],$d['owner'],$d['channel'],$d['time_spent'],$d['date']]);
  echo json_encode(['ok' => true]);

} elseif ($method === 'PUT' && $id) {
  $d = json_decode(file_get_contents('php://input'), true);
  $db->prepare("UPDATE issues SET title=?,desc=?,resolution=?,status=?,priority=?,reporter=?,owner=?,channel=?,time_spent=?,date=? WHERE id=?")
     ->execute([$d['title'],$d['desc'],$d['resolution'],$d['status'],$d['priority'],$d['reporter'],$d['owner'],$d['channel'],$d['time_spent'],$d['date'],$id]);
  echo json_encode(['ok' => true]);

} elseif ($method === 'DELETE' && $id) {
  $db->prepare("DELETE FROM issues WHERE id=?")->execute([$id]);
  echo json_encode(['ok' => true]);
}
