import json
from pathlib import Path
body = Path('/home/ubuntu/rinovabd.com/article-morning-routine.md').read_text(encoding='utf-8')
# Strip the title heading because the CMS stores the title separately.
body = body.split('\n', 2)[2].lstrip('\n') if body.startswith('# ') else body
values = {
    'slug': 'a-gentler-way-to-build-your-morning-routine',
    'title': 'A gentler way to build your morning routine',
    'excerpt': 'A calm, repeatable four-minute skincare ritual for refreshing, hydrating and protecting your skin before the day begins.',
    'body': body,
    'image_url': '/assets/rinova-morning-routine.jpg',
    'category': 'Skin Care',
    'subcategory': 'Morning Routine',
    'content_type': 'article',
    'media_url': '',
    'cover_image_url': '/assets/rinova-morning-routine.jpg',
    'extra_file_url': '',
    'publish_date': '2026-08-26T00:00:00.000Z',
    'duration': '',
    'priority': 10,
    'seo_title': 'A Gentler Morning Skincare Routine | Rinova BD',
    'meta_description': 'Build a calmer morning skincare routine with three gentle steps: cleanse, hydrate and protect. Simple guidance for a repeatable daily ritual.',
    'keywords': 'morning skincare routine, gentle skincare, daily skincare, sunscreen, Rinova BD',
    'allow_search_engines': 1,
    'rights': 'This is hosted here. The page will claim your copyright and link to your licence.',
    'license_url': '',
    'status': 'published',
    'published_at': '2026-08-26T00:00:00.000Z',
    'updated_by': 'seed-article',
    'author': 'Rinova BD',
}
columns = list(values)
quoted = ', '.join("'" + str(values[col]).replace("'", "''") + "'" for col in columns)
updates = ', '.join(f"{col}=excluded.{col}" for col in columns if col not in {'slug', 'updated_by', 'author'})
sql = f"INSERT INTO blog_posts({', '.join(columns)}, updated_at) VALUES ({quoted}, CURRENT_TIMESTAMP) ON CONFLICT(slug) DO UPDATE SET {updates}, updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP"
Path('/tmp/rinova-blog-seed.json').write_text(json.dumps({'database_id': '300aea86-ac31-46b9-aec4-2314f1a78b01', 'sql': sql}, ensure_ascii=False), encoding='utf-8')
print(json.dumps({'slug': values['slug'], 'body_chars': len(body), 'seo_title_chars': len(values['seo_title']), 'meta_description_chars': len(values['meta_description']), 'sql_chars': len(sql)}, ensure_ascii=False))
