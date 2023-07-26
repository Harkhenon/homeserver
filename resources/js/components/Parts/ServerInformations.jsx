import React, { useEffect, useState } from 'react';

import '@sass/Parts/ServerInformations.scss';

import client from '@js/axiosConfig';
import {
  Icon,
  Progress,
  Loader,
  Label,
  Button,
  Grid,
  GridColumn
} from 'semantic-ui-react';

const ServerInformations = (props) => {

  const [ serverOs, setServerOs ] = useState(0)
  const [ serverCpu, setServerCpu ] = useState(0)
  const [ serverRam, setServerRam ] = useState(0)
  const [ serverDisk, setServerDisk ] = useState(0)
  const [ serverConfig, setServerConfig ] = useState(0)

  useEffect(() => {
    const server = setInterval(() => {
      client.get('api/server/informations')
          .catch((error) => {
              toast.error('Unable to reach server informations');
          })
          .then((response) => {
            const informations = response.data;
            setServerCpu(informations.cpu)
            setServerRam(informations.ram)
            setServerDisk(informations.disk[0])
            setServerOs(informations.os)
            setServerConfig(informations.config)
          });
    }, 5000);

    return () => clearInterval(server);
  }, []);

  let cpuColor = 'grey';

  if(serverCpu) {
    if(serverCpu.idle > 33.3) {
      cpuColor = 'green';
    } else if(serverCpu.idle > 66.6) {
      cpuColor = 'yellow';
    } else {
      cpuColor = 'red';
    }
  }

  return (
    <React.Fragment>
      <Grid columns={4} stackable id='server-informations'>
        <Grid.Row>
          <Grid.Column className='cat ui padded'>
            <p className='title ui top left attached label'>
              <Icon name="server" />
              OS
            </p>
            {serverOs && (
              <React.Fragment>
                <p>{serverOs.distro}</p>
                <p>{serverOs.os}</p>
                <p>{serverOs.kernel}</p>
                <p>{serverOs.version}</p>
              </React.Fragment>
            ) || (
              <Loader active inline='centered' />
            )}
          </Grid.Column>
          <Grid.Column className='cat cpu'>
            <div className='title ui top left attached label'>
              <Icon name="microchip" />
              CPU
            </div>
            {serverCpu && (
              <React.Fragment>
                <Progress
                  percent={
                    Math.round(100 - serverCpu.idle)
                  }
                  color={cpuColor}
                >
                  {Math.round(100 - serverCpu.idle)}% CPU Usage
                </Progress>
              </React.Fragment>
            ) || (
              <Loader active inline='centered' />
            )}
          </Grid.Column>
          <Grid.Column className='cat memory'>
            <p className='title ui top left attached label'>RAM</p>
            {serverRam && (
              <React.Fragment>
                <Progress
                  total={serverRam.total}
                  value={serverRam.used}
                >
                  {serverRam.used} Go Used
                </Progress>
                <Button as='div' labelPosition='right'>
                <Button>Total</Button>
                  <Label pointing='left' basic>{serverRam.total} Go</Label>
                </Button>
              </React.Fragment>
            ) || (
              <Loader active inline='centered' />
            )}
          </Grid.Column>
          <Grid.Column className='cat disk'>
            <p className='title ui top left attached label'>
              <Icon name="disk" />
              Disk
            </p>
            {serverDisk && (
              <React.Fragment>
                <Button as='div' labelPosition='right'>
                  <Button>FileSystem</Button>
                  <Label pointing='left' basic>{serverDisk.filesystem}</Label>
                </Button>
                <Button as='div' labelPosition='right'>
                  <Button>Capacity</Button>
                  <Label pointing='left' basic>{serverDisk.available}</Label>
                </Button>
                <Button as='div' labelPosition='right'>
                  <Button>Mounted on</Button>
                  <Label pointing='left' basic>{serverDisk.mounted_on}</Label>
                </Button>
                <Progress 
                  percent={
                    parseInt(RegExp(/[0-9]+/).exec(serverDisk.percent)[0])
                  }
                >
                  {serverDisk.percent} Used
                </Progress>
              </React.Fragment>
            ) || (
              <Loader active inline='centered' />
            )}
          </Grid.Column>
        </Grid.Row>
      </Grid>
    </React.Fragment>
  );
}

export default ServerInformations;

// calculate cpu percentage usage with idle, nice, sys and user
// const cpuPercent = 100 - parseInt(RegExp(/[0-9]+/).exec(serverCpu.idle)[0]);