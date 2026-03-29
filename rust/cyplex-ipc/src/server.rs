use std::path::{Path, PathBuf};
use std::sync::Arc;

use tokio::net::UnixListener;
use tokio::sync::Notify;
use tracing::{error, info};

use crate::error::IpcError;
use crate::protocol::{read_message, write_message, IpcMessage};

/// A Unix-domain-socket server used by the daemon to accept CLI connections.
pub struct IpcServer {
    socket_path: PathBuf,
    listener: UnixListener,
    shutdown_signal: Arc<Notify>,
}

impl IpcServer {
    /// Bind a new IPC server to the given Unix socket path.
    ///
    /// If the socket file already exists it will be removed before binding.
    pub fn bind(socket_path: &str) -> Result<Self, IpcError> {
        let path = Path::new(socket_path);
        if path.exists() {
            std::fs::remove_file(path).map_err(|e| {
                IpcError::SocketBindFailed(format!(
                    "failed to remove existing socket {}: {}",
                    socket_path, e
                ))
            })?;
        }

        let listener = UnixListener::bind(path).map_err(|e| {
            IpcError::SocketBindFailed(format!("failed to bind {}: {}", socket_path, e))
        })?;

        info!(path = socket_path, "IPC server bound");

        Ok(Self {
            socket_path: path.to_path_buf(),
            listener,
            shutdown_signal: Arc::new(Notify::new()),
        })
    }

    /// Accept connections in a loop, dispatching each message through `handler`.
    ///
    /// The handler receives an [`IpcMessage`] and must return an [`IpcMessage`]
    /// as the response. The loop exits gracefully when [`shutdown`] is called.
    pub async fn accept_connections<F>(&self, handler: F) -> Result<(), IpcError>
    where
        F: Fn(IpcMessage) -> IpcMessage + Send + Sync + 'static,
    {
        let handler = Arc::new(handler);
        let shutdown = self.shutdown_signal.clone();

        loop {
            tokio::select! {
                _ = shutdown.notified() => {
                    info!("IPC server shutting down");
                    break;
                }
                result = self.listener.accept() => {
                    match result {
                        Ok((stream, _addr)) => {
                            let handler = Arc::clone(&handler);
                            tokio::spawn(async move {
                                if let Err(e) = handle_connection(stream, handler).await {
                                    error!("connection error: {}", e);
                                }
                            });
                        }
                        Err(e) => {
                            error!("accept error: {}", e);
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// Signal the server to stop accepting new connections.
    pub fn shutdown(&self) -> Result<(), IpcError> {
        info!(path = %self.socket_path.display(), "IPC server shutdown requested");
        self.shutdown_signal.notify_one();

        // Clean up the socket file.
        if self.socket_path.exists() {
            std::fs::remove_file(&self.socket_path).map_err(IpcError::IoError)?;
        }

        Ok(())
    }
}

/// Handle a single client connection, reading messages and writing responses.
async fn handle_connection(
    stream: tokio::net::UnixStream,
    handler: Arc<dyn Fn(IpcMessage) -> IpcMessage + Send + Sync>,
) -> Result<(), IpcError> {
    let (mut reader, mut writer) = stream.into_split();

    loop {
        let msg = match read_message(&mut reader).await {
            Ok(m) => m,
            Err(IpcError::ConnectionClosed) => break,
            Err(e) => return Err(e),
        };

        let response = handler(msg);
        write_message(&mut writer, &response).await?;
    }

    Ok(())
}
