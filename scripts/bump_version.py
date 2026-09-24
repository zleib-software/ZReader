#!/usr/bin/env python3
"""
ZReader Version Bump & Cleanup Automation Script
------------------------------------------------
Regra de incremento:
- Formato: major.minor.patch (ex: 2.0.1)
- patch vai de 0 a 99;
- Ao passar de 99 (ex: 2.0.99), sobe para a segunda casa (2.1.0).
- Se minor passar de 99 (ex: 2.99.99), sobe para o major (3.0.0).

Limpeza automática:
- Remove executáveis, instaladores e zips de versões antigas na pasta release/.

Uso:
  python scripts/bump_version.py              # Incrementa automaticamente 1 patch e limpa releases antigas
  python scripts/bump_version.py 2.0.7        # Define uma versão específica e limpa releases antigas
  python scripts/bump_version.py --clean-only # Apenas limpa versões antigas mantendo a versão atual
"""

import sys
import re
import json
from pathlib import Path

# Suporte universal a UTF-8 no Windows terminal
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

ROOT_DIR = Path(__file__).resolve().parent.parent

def parse_and_increment(v_str: str) -> str:
    parts = [int(p) for p in v_str.strip().split('.')]
    while len(parts) < 3:
        parts.append(0)
    major, minor, patch = parts[0], parts[1], parts[2]
    
    patch += 1
    if patch > 99:
        patch = 0
        minor += 1
        if minor > 99:
            minor = 0
            major += 1
            
    return f"{major}.{minor}.{patch}"

def cleanup_old_releases(current_version: str):
    release_dir = ROOT_DIR / "release"
    if not release_dir.exists():
        return
        
    print(f"🧹 Verificando e limpando versões antigas em {release_dir.name}/...")
    patterns = [
        r"^ZReader\s+(\d+\.\d+\.\d+)\.exe$",
        r"^ZReader\s+Setup\s+(\d+\.\d+\.\d+)\.exe$",
        r"^ZReader\s+Setup\s+(\d+\.\d+\.\d+)\.exe\.blockmap$",
        r"^ZReader-(\d+\.\d+\.\d+)-win\.zip$",
        r"^ZReader-(\d+\.\d+\.\d+)-win\.zip\.blockmap$",
    ]
    
    deleted_count = 0
    for file_path in release_dir.iterdir():
        if not file_path.is_file():
            continue
            
        filename = file_path.name
        for pattern in patterns:
            match = re.match(pattern, filename, re.IGNORECASE)
            if match:
                file_ver = match.group(1)
                if file_ver != current_version:
                    try:
                        file_path.unlink()
                        print(f"  🗑️  Removido antigo: {filename}")
                        deleted_count += 1
                    except Exception as e:
                        print(f"  ⚠️  Não foi possível remover {filename}: {e}")
                break
                
    if deleted_count == 0:
        print(f"  ✓ Nenhum arquivo obsoleto para remover (apenas v{current_version} em uso).")
    else:
        print(f"  ✓ {deleted_count} arquivo(s) de versões antigas removido(s) com sucesso.")

def bump_version(target_version: str = None):
    pkg_path = ROOT_DIR / "package.json"
    if not pkg_path.exists():
        print(f"[ERRO] {pkg_path} não encontrado!")
        sys.exit(1)
        
    with open(pkg_path, "r", encoding="utf-8") as f:
        pkg_data = json.load(f)
        
    old_version = pkg_data.get("version", "2.0.1")
    
    if target_version:
        new_version = target_version.strip()
    else:
        new_version = parse_and_increment(old_version)
        
    print(f"🚀 Atualizando ZReader: v{old_version} -> v{new_version}")
    
    # 1. Atualizar package.json (sem 'Level-Up')
    pkg_data["version"] = new_version
    pkg_data["description"] = f"ZReader v{new_version} - Leitor de mangás desktop moderno, 100% gratuito e local-first"
    with open(pkg_path, "w", encoding="utf-8") as f:
        json.dump(pkg_data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"  ✓ package.json atualizado")
    
    # 2. Atualizar src/version.ts (sem 'Level-Up')
    version_ts_path = ROOT_DIR / "src" / "version.ts"
    version_ts_content = f"""export const APP_VERSION = '{new_version}';
export const APP_NAME = 'ZReader';
"""
    with open(version_ts_path, "w", encoding="utf-8") as f:
        f.write(version_ts_content)
    print(f"  ✓ src/version.ts atualizado")
    
    # 3. Atualizar src/components/layout/Titlebar.tsx (sem 'Level-Up')
    titlebar_path = ROOT_DIR / "src" / "components" / "layout" / "Titlebar.tsx"
    if titlebar_path.exists():
        with open(titlebar_path, "r", encoding="utf-8") as f:
            content = f.read()
        content = re.sub(
            r"v\d+\.\d+\.\d+(\s*•\s*Level-Up)?",
            f"v{new_version}",
            content
        )
        with open(titlebar_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"  ✓ Titlebar.tsx atualizado")
        
    # 4. Atualizar src/features/settings/SettingsView.tsx (sem 'Level-Up Edition')
    settings_path = ROOT_DIR / "src" / "features" / "settings" / "SettingsView.tsx"
    if settings_path.exists():
        with open(settings_path, "r", encoding="utf-8") as f:
            content = f.read()
        content = re.sub(
            r"v\d+\.\d+\.\d+(\s*•\s*Level-Up(\s*Edition)?)?",
            f"v{new_version}",
            content
        )
        with open(settings_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"  ✓ SettingsView.tsx atualizado")
        
    # 5. Atualizar README.md (sem 'Level-Up Edition')
    readme_path = ROOT_DIR / "README.md"
    if readme_path.exists():
        with open(readme_path, "r", encoding="utf-8") as f:
            content = f.read()
        content = re.sub(r"2\.\d+\.\d+", new_version, content)
        content = re.sub(r"\s*\[Level-Up Edition\]", "", content)
        with open(readme_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"  ✓ README.md atualizado")
        
    # 6. Limpar executáveis de versões antigas na pasta release/
    cleanup_old_releases(new_version)
        
    print(f"✨ Sucesso! Versão {new_version} sincronizada em todos os setores e limpa.")
    return new_version

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--clean-only":
        pkg_path = ROOT_DIR / "package.json"
        if pkg_path.exists():
            with open(pkg_path, "r", encoding="utf-8") as f:
                current_ver = json.load(f).get("version", "2.0.1")
            cleanup_old_releases(current_ver)
    else:
        arg_ver = sys.argv[1] if len(sys.argv) > 1 else None
        bump_version(arg_ver)
