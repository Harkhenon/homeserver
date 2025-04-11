import React, { useEffect, useState } from 'react';

import '@sass/Parts/ServerInformations.scss';

import {
  Icon,
  Progress,
  Loader,
  Label,
  Button,
  Grid,
  GridColumn
} from 'semantic-ui-react';

const ServerInformations = ({serverInfo}) => {


  let cpuColor = 'grey';

  if(serverInfo.cpu) {
    cpuColor = "red";
    if(serverInfo.cpu.idle > 33.3) { cpuColor = "yellow" };
    if(serverInfo.cpu.idle > 66.6) { cpuColor = "green" };
  }

  return (
    <React.Fragment>
      <Grid
        columns={4} 
        stackable 
        id='server-informations'
        className="w-1/2 !m-auto"
      >
        <Grid.Row>
          <Grid.Column className='cat'>
            <p className='title ui top left attached label'>
              <Icon name="server" />
              OS
            </p>
            {serverInfo && (
              <React.Fragment>
                <p>{serverInfo.os.distro}</p>
                <p>{serverInfo.os.os}</p>
                <p>{serverInfo.os.kernel}</p>
                <p>{serverInfo.os.version}</p>
              </React.Fragment>
            ) || (
              <Loader active inline='centered' />
            )}
          </Grid.Column>
          <Grid.Column className='cat'>
            <div className='title ui top left attached label'>
              <Icon name="microchip" />
              CPU
            </div>
            {serverInfo.cpu && (
              <React.Fragment>
                <Progress
                  percent={
                    Math.round(100 - serverInfo.cpu.idle)
                  }
                  color={cpuColor}
                >
                  {Math.round(100 - serverInfo.cpu.idle)}% CPU Usage
                </Progress>
              </React.Fragment>
            ) || (
              <Loader active inline='centered' />
            )}
          </Grid.Column>
          <Grid.Column className='cat'>
            <p className='title ui top left attached label'>RAM</p>
            {serverInfo.ram && (
              <React.Fragment>
                <Progress
                  total={serverInfo.ram.total}
                  value={serverInfo.ram.used}
                >
                  {serverInfo.ram.used} Go Used
                </Progress>
                <Button as='div' labelPosition='right'>
                <Button>Total</Button>
                  <Label pointing='left' basic>{serverInfo.ram.total} Go</Label>
                </Button>
              </React.Fragment>
            ) || (
              <Loader active inline='centered' />
            )}
          </Grid.Column>
          <Grid.Column className='cat'>
            <p className='title ui top left attached label'>
              <Icon name="disk" />
              Disk
            </p>
            {serverInfo.disk[0] && (
              <React.Fragment>
                <Button as='div' labelPosition='right'>
                  <Button>FileSystem</Button>
                  <Label pointing='left' basic>{serverInfo.disk[0].filesystem}</Label>
                </Button>
                <Button as='div' labelPosition='right'>
                  <Button>Capacity</Button>
                  <Label pointing='left' basic>{serverInfo.disk[0].available}</Label>
                </Button>
                <Button as='div' labelPosition='right'>
                  <Button>Mounted on</Button>
                  <Label pointing='left' basic>{serverInfo.disk[0].mounted_on}</Label>
                </Button>
                <Progress 
                  percent={
                    parseInt(RegExp(/[0-9]+/).exec(serverInfo.disk[0].percent)[0])
                  }
                >
                  {serverInfo.disk.percent} Used
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
// const cpuPercent = 100 - parseInt(RegExp(/[0-9]+/).exec(serverInfo.idle)[0]);