import React from 'react'
import { Card, Icon, List, Button, Label, Loader } from 'semantic-ui-react';
import { Link } from 'react-router-dom';

const DomainsList = (props) => {

  const { domains, handleEdit } = props;

  return (
    <React.Fragment>
      { !domains ? <Loader /> :
          domains.map(element => (
            <Card key={element.fqdn}>
              <Card.Content>
                <Card.Header>
                  <Icon name="world" />{element.fqdn}
                </Card.Header>
                </Card.Content>
                <Card.Content extra>
                  <Label as={Card.Description}>
                    <Icon name="server"/>DNS servers
                  </Label>
                  <List>
                    <List.Item>
                      <Icon name="arrow right"/>{element.ns1}
                    </List.Item>
                    <List.Item>
                      <Icon name="arrow right"/>{element.ns2}
                    </List.Item>
                  </List>
                </Card.Content>
                <Card.Content extra>
                  
                    {element.default !== 1 && (
                        <Button
                          color="orange"
                          onClick={handleEdit}
                          data-domainid={element.id}
                          as={Link}
                          to="/hosting/general"
                          content="Settings"
                        />
                    ) || (
                        <React.Fragment>
                          <p>Default domain</p>
                          <p>Can't edit or delete it</p>
                        </React.Fragment>
                    )}
                </Card.Content>
            </Card>
        ))
      }
    </React.Fragment>
  )
}

export default DomainsList