use std::collections::HashSet;
use anyhow::Result;

/// Charge les clés de accents.json = ensemble des lettres accentuables.
pub fn load_accentable(path: &str) -> Result<HashSet<char>> {
    let data = std::fs::read_to_string(path)?;
    let v: serde_json::Value = serde_json::from_str(&data)?;
    let mut set = HashSet::new();
    if let Some(obj) = v.as_object() {
        for k in obj.keys() {
            if let Some(c) = k.chars().next() {
                set.insert(c);
            }
        }
    }
    Ok(set)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn loads_keys_as_charset() {
        let f = tempfile_path();
        std::fs::File::create(&f).unwrap()
            .write_all(r#"{"e":["é"],"c":["ç"]}"#.as_bytes()).unwrap();
        let set = load_accentable(f.to_str().unwrap()).unwrap();
        assert!(set.contains(&'e'));
        assert!(set.contains(&'c'));
        assert!(!set.contains(&'x'));
        std::fs::remove_file(&f).ok();
    }

    fn tempfile_path() -> std::path::PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("accents-test-{}.json", std::process::id()));
        p
    }
}
