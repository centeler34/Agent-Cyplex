use serde_json::Value;

/// Sensitive-key fragments that trigger redaction (case-insensitive check).
const SENSITIVE_FRAGMENTS: &[&str] = &["key", "token", "secret", "password"];

/// Recursively walk a JSON value and replace the values of any object keys
/// whose name contains a sensitive fragment with `"[REDACTED]"`.
///
/// This operates **in place** on the provided `Value`.
pub fn redact_secrets(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for (key, val) in map.iter_mut() {
                let lower = key.to_lowercase();
                if SENSITIVE_FRAGMENTS
                    .iter()
                    .any(|frag| lower.contains(frag))
                {
                    *val = Value::String("[REDACTED]".into());
                } else {
                    redact_secrets(val);
                }
            }
        }
        Value::Array(arr) => {
            for item in arr.iter_mut() {
                redact_secrets(item);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn redacts_flat_keys() {
        let mut v = json!({
            "api_key": "sk-abc123",
            "auth_token": "tok-xyz",
            "name": "alice"
        });
        redact_secrets(&mut v);
        assert_eq!(v["api_key"], "[REDACTED]");
        assert_eq!(v["auth_token"], "[REDACTED]");
        assert_eq!(v["name"], "alice");
    }

    #[test]
    fn redacts_nested_keys() {
        let mut v = json!({
            "config": {
                "db_password": "hunter2",
                "host": "localhost"
            }
        });
        redact_secrets(&mut v);
        assert_eq!(v["config"]["db_password"], "[REDACTED]");
        assert_eq!(v["config"]["host"], "localhost");
    }

    #[test]
    fn redacts_inside_arrays() {
        let mut v = json!([
            {"client_secret": "s3cr3t"},
            {"value": 42}
        ]);
        redact_secrets(&mut v);
        assert_eq!(v[0]["client_secret"], "[REDACTED]");
        assert_eq!(v[1]["value"], 42);
    }

    #[test]
    fn case_insensitive() {
        let mut v = json!({"API_KEY": "x", "Secret_Token": "y"});
        redact_secrets(&mut v);
        assert_eq!(v["API_KEY"], "[REDACTED]");
        assert_eq!(v["Secret_Token"], "[REDACTED]");
    }
}
