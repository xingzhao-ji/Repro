# Deployment plan — no publication authorized

The deliverable is local-only. There is no hosted endpoint, repository publication, telemetry, paid service, account provisioning or uploaded source data.

Before any hosted deployment, obtain explicit authorization for destination/account, source and artifact disclosure, resource limits and budget, authentication, retention and deletion policy, and the exact revision. Specify eligible trusted apps and supported execution boundaries. A public untrusted-capsule service additionally requires an independently reviewed VM/sandbox, egress enforcement, tenant isolation, secret handling, abuse limits and operational recovery. Ordinary local container evidence does not establish those properties.

Prepare a private CI build using the committed lockfile and explicit Chromium image/version. Run all local gates plus clean Linux-container replay, adversarial boundary tests and fresh screenshot/accessibility checks on the exact proposed commit. Review artifact privacy before upload. Record CI terminal status, deployment identity and live browser/API/data behavior only after an authorized deployment actually occurs. A deployment plan or green local test is not deployed evidence.
