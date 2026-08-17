unit ResourceUnit;

interface

{$R ResourceUnit.res}

function ResourceMessage: string;

implementation

function ResourceMessage: string;
begin
  Result := 'resource-ok';
end;

end.
