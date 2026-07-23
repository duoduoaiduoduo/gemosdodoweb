import re

def update_css():
    with open('src/index.css', 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the block around @media (max-width: 1024px)
    # We will replace from `--m-text: #101726;` down to `.m-nav-btn:active {`
    
    # Let's just do a string replacement for the variables
    content = re.sub(
        r'--m-text: #101726;.*?(?=        --m-action-text: #ffffff;)',
        '''--m-text: #000000;
        --m-muted: #666666;
        --m-border: #000000;
        --m-surface: #ffffff;
        --m-surface-soft: #ffffff;
        --m-surface-strong: #ffffff;
        --m-accent: #ff66a1;
        --m-accent-text: #ffffff;
        --m-action-bg: #000000;
        --m-action-border: #000000;
''', content, flags=re.DOTALL)

    content = re.sub(
        r'--m-text: #f4f7ff;.*?(?=        --m-action-text: #f4f7ff;)',
        '''--m-text: #ffffff;
        --m-muted: #999999;
        --m-border: #ffffff;
        --m-surface: #000000;
        --m-surface-soft: #000000;
        --m-surface-strong: #000000;
        --m-accent: #ff66a1;
        --m-accent-text: #ffffff;
        --m-action-bg: #ffffff;
        --m-action-border: #ffffff;
''', content, flags=re.DOTALL)

    content = re.sub(
        r'--m-bg: #f6f7fb;.*?(?=        --m-radius-sm: 10px;)',
        '''--m-bg: #ffffff;
        --m-bg-soft: #ffffff;
        --m-card: #ffffff;
        --m-card-2: #ffffff;
        --m-line: #000000;
        --m-line-strong: #000000;
        --m-ink: #000000;
        --m-ink-soft: #666666;
        --m-accent-blue: #ff66a1;
        --m-accent-blue-soft: #ff66a1;
        --m-shadow-1: none;
        --m-shadow-2: none;
        --m-radius-lg: 0px;
        --m-radius-md: 0px;
''', content, flags=re.DOTALL)

    # 1. Background layer
    content = content.replace(
        'background: radial-gradient(1200px 560px at 0% -10%, #f1f5ff, transparent 65%), var(--m-bg);',
        'background: var(--m-bg);'
    )
    
    # 2. Hero Background
    content = content.replace(
        '''        background:
          linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,251,255,0.92)),
          radial-gradient(480px 180px at 100% -30%, rgba(59,130,246,0.1), transparent 70%);''',
        '        background: var(--m-surface);'
    )
    
    # 3. Topbar lang
    content = content.replace(
        '        background: linear-gradient(180deg, #ffffff, #f7f9fc);',
        '        background: var(--m-surface);'
    )
    
    # 4. Topbar admin
    content = content.replace(
        '        background: linear-gradient(180deg, rgba(255, 255, 255, 0.52), rgba(247, 249, 252, 0.45));',
        '        background: var(--m-surface);'
    )

    # 5. Nav Btn
    content = content.replace(
        '        background: linear-gradient(180deg, var(--m-card), var(--m-card-2));',
        '        background: var(--m-surface);'
    )
    
    # 6. Masonry overlay
    content = content.replace(
        '        background: linear-gradient(to top, rgba(15,23,42,0.78), rgba(15,23,42,0.26), transparent);',
        '        background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);'
    )
    
    # 7. Add hero social link monochrome
    content = content.replace(
        '''    .m-logo-zone {''',
        '''    .hero-social-link {
        filter: grayscale(1) brightness(0);
        transition: filter 0.2s;
    }
    .hero-social-link:hover {
        filter: invert(56%) sepia(50%) saturate(5185%) hue-rotate(309deg) brightness(101%) contrast(101%);
    }
    html.dark .hero-social-link {
        filter: grayscale(1) brightness(2);
    }
    html.dark .hero-social-link:hover {
        filter: invert(56%) sepia(50%) saturate(5185%) hue-rotate(309deg) brightness(101%) contrast(101%);
    }

    .m-logo-zone {'''
    )

    with open('src/index.css', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    update_css()
