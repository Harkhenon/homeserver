import MainLayout from '@/Layouts/MainLayout';
import CPU from '@img/cpu.jpg';
import HDD from '@img/hdd.jpg';
import OS from '@img/os.jpg';
import RAM from '@img/ram.jpg';
import TEMPERATURE from '@img/temperature.jpg';
import { Head } from '@inertiajs/react';
import { Box } from '@mui/material';
import Server from '@pages/Parts/Server';
import '@sass/Home.scss';
import { useEffect, useRef, useState } from 'react';

function Home() {
  const [serverInfo, setServerInfo] = useState();
  const [socket, setSocket] = useState();
  let socketInterval = useRef(null);

  useEffect(() => {
    if (!socket) {
      setSocket(new WebSocket('wss://localhost:6256/status'));
    } else {
      socket.onmessage = ({ data }) => {
        data = JSON.parse(JSON.parse(data));
        setServerInfo(data);
      };
      socket.onopen = () => {
        switch (socket.readyState) {
          case WebSocket.CONNECTING:
            console.log('[Homeserver] connecting...');
            break;
          case WebSocket.OPEN:
            console.log('[Homeserver] connected.');
            break;
          case WebSocket.CLOSING:
            console.log('[Homeserver] closing connection...');
            break;
          case WebSocket.CLOSED:
            console.log('[Homeserver] disconnected.');
            break;
        }
        socket.send('check');
        socketInterval.current = setInterval(() => {
          socket.send('check');
        }, 5000);
      };
      socket.onclose = () => {
        console.info('[Homeserver] disconnected');
      };
    }

    return () => {
      clearInterval(socketInterval.current);
    };
  }, [socketInterval, socket]);

  const content = (
    <Box
      component="main"
      sx={{
        containerType: 'inline-size',
        flexGrow: 1,
      }}
    >
      <Head title="Accueil" />
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-evenly',
          backgroundColor: 'rgba(32,32,32,0.5)',
          borderRadius: '8px',
          margin: '0 auto',
          marginTop: 10,
          width: {
            '@lg': '80vw',
            '@md': '100vw',
          },
        }}
      >
        <Server
          name="OS"
          value={serverInfo ? serverInfo.platform : ''}
          image={{
            link: OS,
            title: 'os',
          }}
          loading={!serverInfo ? true : false}
        />
        <Server
          name="CPU"
          value={serverInfo ? serverInfo.cpu : 0}
          progress
          image={{
            link: CPU,
            title: 'cpu',
          }}
          loading={!serverInfo ? true : false}
        />
        <Server
          name="RAM"
          value={serverInfo ? serverInfo.ram : 0}
          progress
          image={{
            link: RAM,
            title: 'ram',
          }}
          loading={!serverInfo ? true : false}
        />
        <Server
          name="DISK"
          value={serverInfo ? serverInfo.disk : 0}
          progress
          image={{
            link: HDD,
            title: 'hdd',
          }}
          loading={!serverInfo ? true : false}
        />
        <Server
          name="TEMPERATURE"
          value={serverInfo ? `${serverInfo.temperature} °C` : 0}
          image={{
            link: TEMPERATURE,
            title: 'temperature',
          }}
          loading={!serverInfo ? true : false}
        />
      </Box>
    </Box>
  );

  return <MainLayout>{content}</MainLayout>;
}

export default Home;
