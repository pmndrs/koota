import { useEffect, useState } from "react";
import { BenchmarkViewer } from "./BenchmarkViewer";

const App = () => {
  const [status, setStatus] = useState("Connecting to log stream...");
  const [nodes, setNodes] = useState([])

  useEffect(() => {
    const eventSource = new EventSource('/stream-logs');
    
    eventSource.onopen = () => {
      setStatus("Connection established. Streaming logs...");
    };

    eventSource.onmessage = (message) => {
      try {
        const data = JSON.parse(message.data);
        const {event, ...payload} = data
        if (event === 'complete') {
          console.log({payload})
          setNodes(payload.rootNodes)
        }
      } catch (error) {
        console.error('Failed to parse incoming message:', error, message.data);
      }
    };

    eventSource.addEventListener('done', () => {
      setStatus("Stream complete.");
      eventSource.close();
    });

    eventSource.onerror = () => {
      setStatus("Connection error.");
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, []);
  return (
   <>
    {nodes.length ? (
      <BenchmarkViewer data={nodes} />
    ) : <h2>{status}</h2>}
  </>
  )
}

export default App;