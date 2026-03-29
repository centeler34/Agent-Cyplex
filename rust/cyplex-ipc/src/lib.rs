pub mod client;
pub mod error;
pub mod protocol;
pub mod server;
pub mod session_token;

pub use client::IpcClient;
pub use error::IpcError;
pub use protocol::{IpcMessage, MessageType};
pub use server::IpcServer;
pub use session_token::SessionToken;

/// Bind an IPC server at the given Unix socket path (daemon side).
pub fn bind_server(socket_path: &str) -> Result<IpcServer, IpcError> {
    IpcServer::bind(socket_path)
}

/// Connect an IPC client to the daemon at the given Unix socket path (CLI side).
pub async fn connect_client(socket_path: &str) -> Result<IpcClient, IpcError> {
    IpcClient::connect(socket_path).await
}
