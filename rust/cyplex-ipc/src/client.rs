use tokio::net::UnixStream;
use tracing::info;

use crate::error::IpcError;
use crate::protocol::{read_message, write_message, IpcMessage};

/// A Unix-domain-socket client used by the CLI to communicate with the daemon.
pub struct IpcClient {
    stream: Option<UnixStream>,
}

impl IpcClient {
    /// Connect to the daemon's IPC server at the given socket path.
    pub async fn connect(socket_path: &str) -> Result<Self, IpcError> {
        let stream = UnixStream::connect(socket_path)
            .await
            .map_err(|e| IpcError::ConnectionFailed(format!("{}: {}", socket_path, e)))?;

        info!(path = socket_path, "IPC client connected");

        Ok(Self {
            stream: Some(stream),
        })
    }

    /// Send a message to the daemon and wait for a response.
    pub async fn send(&mut self, message: IpcMessage) -> Result<IpcMessage, IpcError> {
        let stream = self
            .stream
            .as_mut()
            .ok_or(IpcError::ConnectionClosed)?;

        let (mut reader, mut writer) = stream.split();

        write_message(&mut writer, &message).await?;
        let response = read_message(&mut reader).await?;

        Ok(response)
    }

    /// Disconnect from the daemon.
    pub fn disconnect(&mut self) -> Result<(), IpcError> {
        if let Some(stream) = self.stream.take() {
            drop(stream);
            info!("IPC client disconnected");
        }
        Ok(())
    }
}
