case 'POST':
    $d = body();
    if (empty($d['title'])) err('title required');
    $stmt = $pdo->prepare(
        "INSERT INTO events(title,description,resolution,category,tags,status,priority,start_time,end_time,affected)
         VALUES(?,?,?,?,?,?,?,?,?,?)"
    );
    $stmt->execute([
        $d['title'] ?? '',
        $d['description'] ?? '',
        $d['resolution'] ?? '',
        $d['category'] ?? 'Other',
        $d['tags'] ?? '',
        $d['status'] ?? 'Open',
        $d['priority'] ?? 'Medium',
        $d['start_time'] ?? null,
        $d['end_time'] ?? null,
        $d['affected'] ?? '',
    ]);
    respond(['id' => (int)$pdo->lastInsertId()]);
