import React from 'react'
import { Card, Icon, List, Button, Label, Loader } from 'semantic-ui-react';

const DomainsList = (props) => {

  const { domains, handleEdit, handleDelete } = props;

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
                      <div className="ui two buttons">
                        <Button
                          color="orange"
                          labelPosition='left'
                          icon
                          onClick={handleEdit}
                          data-id={element.fqdn}
                        >
                          <Icon name='edit'/>
                          Edit
                        </Button>
                        <Button
                          color="red"
                          labelPosition='right'
                          icon
                          onClick={handleDelete}
                          data-id={element.fqdn}
                        >
                          Delete
                          <Icon name='delete'/>
                        </Button>
                      </div>
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